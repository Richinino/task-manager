"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarArrowUp, Star, Trash2 } from "lucide-react";

import type { RitualPeriod } from "@/lib/rituals";
import { formatRelativeSk, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EstimateChip } from "@/components/task/estimate-chip";
import { PostponeBadge } from "@/components/task/postpone-badge";
import {
  RitualShell,
  ritualRowClass,
  type RitualPayload,
  type RitualStep,
} from "@/components/rituals/ritual-shell";
import { TimeBudget } from "@/components/views/dnes/time-budget";
import {
  deleteTask,
  materializeDueRecurrences,
  rescheduleTask,
  setFrog,
} from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   RANNÉ PLÁNOVANIE — 3 minúty

   Tri kroky: čo horí z minulosti → jedna priorita na dnes → koľko toho je.

   Poradie nie je náhodné. Najprv sa upratuje minulosť, lebo prepadnuté úlohy
   sú jediná vec, ktorá dokáže rozbiť aj dobre premyslený deň. Keby sa priorita
   vyberala prvá, človek by si vybral „tú jednu vec" a o minútu by mu do dňa
   spadli tri týždeň staré. Rozpočet času ide naopak posledný — má zrkadliť
   deň aj s tým, čo doň práve pribudlo.

   Rozhodnutia sa vykonávajú HNEĎ pri kliknutí, nie až na konci. Sprievodca sa
   dá zavrieť v polovici a to, čo už človek rozhodol, musí platiť — inak by
   ďalšie ráno začínalo tam, kde predošlé.

   Komponent si nepočíta NIČ: dnešok, kandidátov aj všetky čísla rozpočtu
   (vrátane minút porád z kalendára) dostáva propom zo servera. Čokoľvek odvodené z `new Date()` v klientovi by sa
   rozišlo so serverom — polnoc v pásme používateľa a polnoc v pásme
   prehliadača nie sú ten istý okamih.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ako dopadla jedna prepadnutá úloha. */
type OverdueDecision = "today" | "dropped";

/**
 * Od akého podielu naplneného dňa hovoríme, že je na hrane.
 *
 * Zámerne nie sto percent: deň naplánovaný presne na doraz nemá kam dať prvý
 * telefonát a pretečie vždy. Osemdesiat percent je hranica, po ktorej má zmysel
 * varovať skôr, než sa to stane.
 */
const TIGHT_RATIO = 0.8;

export interface MorningPlanProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: RitualPeriod;
  /** Dnešok v pásme používateľa. Prepadnuté úlohy sa presúvajú naň. */
  todayIso: string;
  initialPayload?: RitualPayload;
  /** Prepadnuté úlohy z minulosti — z `getOverdueTasks(userId, todayIso)`. */
  overdue: TaskWithRelations[];
  /**
   * Z čoho sa vyberá priorita dňa — dnešné nevybavené úlohy.
   *
   * Priorita dňa je viazaná na `plannedDate`, takže kandidát bez dnešného
   * dátumu by sa síce označil, ale na obrazovke „Dnes" by nesvietil nikde.
   * Výber správnej množiny je preto na volajúcej obrazovke, nie tu.
   */
  candidates: TaskWithRelations[];
  /** Súčet odhadov naplánovaných na dnes, v minútach. */
  plannedMin: number;
  /** Hrubý čas dňa (`dayEndHour` − `dayStartHour`), v minútach — ešte bez porád. */
  availableMin: number;
  /**
   * Minúty, ktoré si z dňa berú porady z kalendára.
   *
   * Bez nich by rituál o tom istom dni tvrdil niečo iné než obrazovka „Dnes":
   * osemhodinový deň so štyrmi hodinami porád a piatimi hodinami práce je na
   * „Dnes" červený, ale rozsudok počítaný z hrubého dňa by ho odobril. Kalendár
   * je doplnok, takže predvolená nula — bez pripojeného účtu sa nič nemení.
   */
  meetingMin?: number;
  /**
   * Koľko dnešných úloh nemá odhad. Bez tohto čísla by súčet vyzeral ako celá
   * pravda, hoci je to len spodný odhad.
   */
  withoutEstimate: number;
  /**
   * Prahy odkladov z nastavení používateľa. Odznak má vlastné rozumné
   * predvolené hodnoty, ale keď si človek prahy posunul, má svietiť podľa
   * jeho čísel — nie podľa cudzích.
   */
  postponeWarnAt?: number;
  postponeBlockAt?: number;
}

export function MorningPlan({
  open,
  onOpenChange,
  period,
  todayIso,
  initialPayload,
  overdue,
  candidates,
  plannedMin,
  availableMin,
  meetingMin = 0,
  withoutEstimate,
  postponeWarnAt,
  postponeBlockAt,
}: MorningPlanProps) {
  /**
   * Vybavené prepadnuté úlohy. Server ich zo zoznamu odstráni sám, len až po
   * prekreslení — dovtedy drží riadok preč tento optimistický záznam. Pri
   * zlyhaní sa záznam zmaže a úloha sa vráti aj s hláškou.
   */
  /*
    Dobehnutie zameškaných opakovaní.

    Toto je ten moment, o ktorom hovorí kontrakt v `docs/CONVENTIONS.md`:
    opakovaná úloha zakladá ďalší výskyt až pri odškrtnutí, takže čo sa nikdy
    neodškrtne, by sa nikdy nezopakovalo — mesačná faktúra by po jednom
    vynechaní zmizla navždy. Ranný sprievodca beží denne a je to jediné miesto,
    kde sa to dá dobehnúť bez cronu.

    Beží raz na otvorenie, nie pri každom prekreslení: akcia zapisuje do
    databázy a `revalidatePath` v nej vzápätí prekreslí stránku, čo by inak
    spustilo ďalší beh dokola.
  */
  const materializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (materializedFor.current === todayIso) return;
    materializedFor.current = todayIso;

    void materializeDueRecurrences(todayIso).catch(() => {
      // Zlyhanie nesmie zhodiť rituál — človek si deň naplánuje aj bez toho
      // a nabudúce sa dobehnutie zopakuje.
    });
  }, [open, todayIso]);

  const [handled, setHandled] = useState<Record<string, OverdueDecision>>({});
  const [overdueError, setOverdueError] = useState<string | null>(null);
  const [, startOverdueTransition] = useTransition();

  /**
   * Vybraná priorita dňa. Počiatočná hodnota sa berie z dát, nie z odpovedí
   * rituálu: pravdu o priorite dňa drží `isFrog` na úlohe a payload by sa s ňou
   * vedel rozísť, keby ju človek medzitým prepol na obrazovke „Dnes".
   */
  const [frogId, setFrogId] = useState<string | null>(
    () => candidates.find((task) => task.isFrog)?.id ?? null,
  );
  const [frogError, setFrogError] = useState<string | null>(null);
  const [frogPending, startFrogTransition] = useTransition();

  /**
   * Základ pre relatívne dátumy. Vzniká z `todayIso`, takže „včera" znamená
   * včerajšok používateľa, nie prehliadača.
   */
  const now = parseIsoDate(todayIso);

  const burning = overdue.filter((task) => handled[task.id] === undefined);
  const handledCount = Object.keys(handled).length;

  function decideOverdue(task: TaskWithRelations, decision: OverdueDecision): void {
    setHandled((current) => ({ ...current, [task.id]: decision }));
    setOverdueError(null);

    startOverdueTransition(async () => {
      const revert = (message: string): void => {
        setHandled((current) => {
          const next = { ...current };
          delete next[task.id];
          return next;
        });
        setOverdueError(message);
      };

      try {
        const result =
          decision === "dropped"
            ? await deleteTask(task.id)
            : await rescheduleTask(task.id, todayIso);
        /*
          Presun prepadnutej úlohy na dnes je z pohľadu servera odklad, takže
          ho môže zastaviť prah z M5 (`code: "postpone_blocked"`). Tu sa to
          rieši ako každá iná chyba — hláškou. Dialóg strážcu by sa otvoril
          NAD sprievodcom a rozbil by mu tok, a rozhodovanie o tom, ako úlohu
          rozdeliť, do trojminútového rituálu nepatrí. Úloha ostane visieť
          a človek ju uvidí na „Dnes", kde má strážca svoje miesto.
        */
        if (!result.ok) revert(result.error || "Rozhodnutie sa nepodarilo uložiť.");
      } catch {
        revert("Rozhodnutie sa nepodarilo uložiť.");
      }
    });
  }

  function chooseFrog(task: TaskWithRelations): void {
    /*
      Odobrať prioritu sa tu nedá a je to zámer: ráno má rozhodnúť, nie vyberať
      a vracať. Zmena je jedno kliknutie na inú úlohu — `setFrog(id, true)`
      zhasne ostatné v ten deň sám.
    */
    if (frogId === task.id) return;

    const previous = frogId;
    setFrogId(task.id);
    setFrogError(null);

    startFrogTransition(async () => {
      try {
        const result = await setFrog(task.id, true);
        if (!result.ok) {
          setFrogId(previous);
          setFrogError(result.error);
        }
      } catch {
        setFrogId(previous);
        setFrogError("Prioritu dňa sa nepodarilo nastaviť.");
      }
    });
  }

  /*
    Porady sa odpočítavajú rovnako ako v rozpočte na obrazovke „Dnes" —
    rozsudok stojí na čase, ktorý na prácu naozaj zostal, nie na hodinách dňa
    z nastavení. Inak by ráno odobrilo deň, ktorý o dva kliky vedľa svieti
    načerveno, a človek by uveril tomu miernejšiemu.
  */
  const meetings = Math.max(0, Math.round(meetingMin));
  const workMin = availableMin - meetings;
  const verdict = loadVerdict(plannedMin, workMin, availableMin);

  const steps: RitualStep[] = [
    {
      key: "overdue",
      title: "Čo horí",
      hint: "Úlohy, ktorých deň už prešiel. Vezmi ich na dnes, alebo ich zahoď — visieť ďalej nemôžu.",
      render: () => (
        <div className="flex flex-col gap-2">
          {burning.length === 0 ? (
            <p className="text-body leading-relaxed text-fg-muted">
              {overdue.length === 0
                ? "Z minulosti nič nevisí. Začínaš s čistým stolom."
                : "Hotovo — z minulosti už nič nevisí."}
            </p>
          ) : (
            burning.map((task) => {
              const late = lateLabel(task, now);
              return (
                <div key={task.id} className={cn(ritualRowClass, "flex-col gap-2")}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="min-w-0 text-sm leading-snug text-fg">{task.title}</p>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {late ? <span className="text-xs text-danger">{late}</span> : null}
                      {task.estimateMin !== null ? (
                        <EstimateChip minutes={task.estimateMin} size="sm" />
                      ) : null}
                      {/* Počítadlo odkladov je práve tu najcennejšie: ukáže tú
                          úlohu, pred ktorou človek uteká už niekoľko rán. */}
                      <PostponeBadge
                        count={task.postponeCount}
                        size="sm"
                        warnAt={postponeWarnAt}
                        dangerAt={postponeBlockAt}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <ChoiceButton
                      onClick={() => decideOverdue(task, "today")}
                      Icon={CalendarArrowUp}
                      label="Na dnes"
                      ariaLabel={`Presunúť úlohu „${task.title}" na dnes`}
                    />
                    <ChoiceButton
                      onClick={() => decideOverdue(task, "dropped")}
                      Icon={Trash2}
                      label="Zahodiť"
                      ariaLabel={`Zahodiť úlohu „${task.title}"`}
                      danger
                    />
                  </div>
                </div>
              );
            })
          )}

          {/* Riadky miznú hneď po kliknutí. Bez počítadla by to vyzeralo, akoby
              sa úlohy strácali samy od seba — takto je vidieť odrobené. */}
          {handledCount > 0 ? (
            <p className="text-body text-fg-subtle">Vybavené: {handledCount}.</p>
          ) : null}

          {overdueError ? (
            <p role="alert" className="text-body leading-relaxed text-danger">
              {overdueError}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "priority",
      title: "Priorita dňa",
      hint: "Jedna úloha, ktorú dnes spravíš ako prvú — aj keby už nič iné z dnešného dňa nevyšlo, deň bude dobrý.",
      render: () => (
        <div className="flex flex-col gap-2">
          {candidates.length === 0 ? (
            <p className="text-body leading-relaxed text-fg-muted">
              Na dnes zatiaľ nič nemáš. Prioritu si vyberieš, keď do dňa pribudne prvá
              úloha.
            </p>
          ) : (
            candidates.map((task) => {
              const selected = frogId === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  aria-pressed={selected}
                  /* Dve rýchle kliknutia po sebe by sa na serveri mohli vybaviť
                     v opačnom poradí a priorita by skončila na inej úlohe, než
                     ktorú človek vidí zvýraznenú. Zámok trvá jednu odpoveď. */
                  disabled={frogPending}
                  onClick={() => chooseFrog(task)}
                  aria-label={`Vybrať úlohu „${task.title}" ako prioritu dňa`}
                  className={cn(
                    ritualRowClass,
                    // 44 px je dotykový cieľ na telefóne; od `sm:` sa zoznam
                    // vracia k hustote nástroja.
                    "min-h-11 w-full cursor-pointer items-center text-left sm:min-h-9",
                    "transition-colors duration-100 ease-out",
                    "disabled:pointer-events-none disabled:opacity-45",
                    selected
                      ? "border-frog bg-frog-soft"
                      : "hover:border-border-strong hover:bg-surface-2",
                  )}
                >
                  <Star
                    aria-hidden="true"
                    size={14}
                    className={cn(
                      "shrink-0",
                      selected ? "fill-current text-frog" : "text-fg-subtle",
                    )}
                  />
                  <span className="min-w-0 flex-1 text-sm leading-snug text-fg">
                    {task.title}
                  </span>
                  {task.estimateMin !== null ? (
                    <EstimateChip minutes={task.estimateMin} size="sm" />
                  ) : null}
                </button>
              );
            })
          )}

          {frogId !== null ? (
            <p className="text-body leading-relaxed text-fg-muted">
              Toto je tá jedna vec. Nech sa dnes stane čokoľvek, spravíš ju.
            </p>
          ) : null}

          {frogError ? (
            <p role="alert" className="text-body leading-relaxed text-danger">
              {frogError}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "load",
      title: "Koľko toho je",
      hint: "Zrkadlo, nie úloha. Nič sa tu nerozhoduje — len je vidieť, či sa deň dá stihnúť.",
      render: () => (
        <div className="flex flex-col gap-2.5">
          {/*
            Rozpočet času je ten istý, aký človek vidí na obrazovke „Dnes",
            a preto sa sem berie ten istý komponent. Vlastná kópia pruhu by sa
            mu skôr či neskôr rozišla v číslach aj v texte a rituál by tvrdil
            niečo iné než obrazovka o dva kliky vedľa.
          */}
          <TimeBudget
            plannedMin={plannedMin}
            availableMin={availableMin}
            meetingMin={meetings}
            withoutEstimate={withoutEstimate}
          />

          {/* Rozsudok je zámerne jedna veta. Že súčet nepozná úlohy bez odhadu,
              hovorí `TimeBudget` — dvakrát to isté by znelo ako výhovorka. */}
          <p className={cn("text-body leading-relaxed", verdict.tone)}>{verdict.text}</p>
        </div>
      ),
    },
  ];

  /*
    Odpovede sprievodcu ostávajú prázdne a je to správne: ranné plánovanie
    nemá žiadnu vlastnú odpoveď. Všetko, čo sa v ňom rozhodne, je zapísané
    priamo na úlohách (`plannedDate`, `deletedAt`, `isFrog`) a v `task_events`.
    Odpisovať to ešte raz do `reviews.payload` by znamenalo dve pravdy, ktoré
    sa vedia rozísť. `initialPayload` sa aj tak podáva ďalej — kostra si podľa
    neho vie nadviazať na rozrobený rituál.
  */
  return (
    <RitualShell
      type="daily_plan"
      period={period}
      open={open}
      onOpenChange={onOpenChange}
      steps={steps}
      initialPayload={initialPayload}
    />
  );
}

/**
 * Čím presne úloha prepadla.
 *
 * Prepadnutá je buď podľa plánu, alebo — ak plán nemá — podľa termínu; presne
 * v tomto poradí ich vyberá `getOverdueTasks`. Rozlíšenie je dôležité: zmeškaný
 * termín je iná váha než neurobený plán.
 */
function lateLabel(task: TaskWithRelations, now: Date): string | null {
  if (task.plannedDate !== null) {
    return `plánované na ${formatRelativeSk(task.plannedDate, now)}`;
  }
  if (task.dueDate !== null) return `termín ${formatRelativeSk(task.dueDate, now)}`;
  return null;
}

/**
 * Veta o naplnenosti dňa a jej tón.
 *
 * Rozsudok patrí sem, nie do `src/lib`: je to text rozhrania, nie logika —
 * a jediné, čo z neho plynie, je farba jedného odstavca.
 */
function loadVerdict(
  plannedMin: number,
  workMin: number,
  dayMin: number,
): { tone: string; text: string } {
  /*
    Na prácu nemusí zostať nič z dvoch rôznych dôvodov a rada musí sedieť na
    ten správny. Buď hodiny dňa v nastaveniach nedávajú žiadny čas, alebo sú
    v poriadku a zjedli ich porady — posielať človeka do nastavení kvôli
    plnému kalendáru by ho poslalo opravovať niečo, čo je v poriadku.
  */
  if (workMin <= 0) {
    return dayMin <= 0
      ? {
          tone: "text-fg-muted",
          text: "Prepočet dnes nič nepovie — najprv treba opraviť hodiny dňa v nastaveniach.",
        }
      : {
          tone: "text-danger",
          text: "Na prácu dnes neostáva nič — celý deň zaberajú porady. Čo sa má stať, musí ísť inam.",
        };
  }

  if (plannedMin <= 0) {
    return {
      tone: "text-fg-muted",
      text: "Na dnes nemáš naplánované nič. Deň je zatiaľ prázdny.",
    };
  }

  if (plannedMin > workMin) {
    return {
      tone: "text-danger",
      text: "Deň je prepchatý. Niečo z toho dnes nebude — nech to vyberieš ty ráno, nie únava večer.",
    };
  }

  if (plannedMin >= workMin * TIGHT_RATIO) {
    return {
      tone: "text-warn",
      text: "Deň je plný po okraj. Prvá nečakaná vec ti ho rozhodí.",
    };
  }

  return {
    tone: "text-success",
    text: "Deň sa zmestí. Rezerva je to, čo z plánu robí plán.",
  };
}

/**
 * Tlačidlo rozhodnutia v riadku.
 *
 * Popis pre čítačky nesie aj názov úlohy: samotné „Na dnes" sa v zozname
 * opakuje pri každom riadku a bez kontextu nehovorí nič.
 */
function ChoiceButton({
  onClick,
  Icon,
  label,
  ariaLabel,
  danger,
}: {
  onClick: () => void;
  Icon: typeof Trash2;
  label: string;
  ariaLabel: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded border border-border bg-surface px-2.5",
        "text-body text-fg transition-colors duration-100 ease-out sm:min-h-8",
        danger
          ? "hover:border-danger hover:text-danger"
          : "hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <Icon aria-hidden="true" size={14} className="shrink-0" />
      {label}
    </button>
  );
}

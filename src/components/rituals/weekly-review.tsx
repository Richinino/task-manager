"use client";

import type { Route } from "next";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Ban,
  CheckCheck,
  Hourglass,
  Inbox,
  Pause,
  Rocket,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { diffDays, formatDayMonthSk } from "@/lib/dates";
import type { RitualPeriod } from "@/lib/rituals";
import { cn } from "@/lib/utils";
import {
  RitualShell,
  ritualRowClass,
  type RitualPayload,
  type RitualStep,
} from "@/components/rituals/ritual-shell";
import { AreaDot } from "@/components/task/area-dot";
import { agoLabel, touchAgeLabel } from "@/components/views/napady/idea-labels";
import type { IncubatorItem } from "@/components/views/napady/incubator-strip";
import { setIdeaStage, touchIdea } from "@/server/actions/ideas";
import { setWaiting } from "@/server/actions/tasks";
import type { ProjectWithCounts } from "@/server/queries/structure";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   TÝŽDENNÁ REVÍZIA — 15 minút

   Šesť krokov: inbox na nulu → čaká sa na → projekty → tri nápady → čo bolo
   dobré → čo si dokázal.

   Revízia má tri druhy krokov a je dôležité ich nemiešať:

     ROZHODNUTIA (čakanie, nápady) menia databázu HNEĎ. Revízia sa dá zavrieť
     v polovici a to, čo už človek rozhodol, musí platiť — inak by ďalší týždeň
     začínal tam, kde predošlý.

     ODPOVEDE (projekty, „čo bolo dobré“) idú len do payloadu cez `setValue`.
     Sú to poznámky o stave, nie príkazy: na otázku „pohol sa projekt?“ niet
     čo v databáze prepísať a domýšľať si z odpovede archiváciu by znamenalo,
     že revízia potichu maže prácu.

     ČÍTANIE (win report) nemení nič a nič neukladá — len ukazuje, čo je za
     človekom. Je to zámerne POSLEDNÝ krok: päť krokov predtým sa pýta na
     nedotiahnuté veci a revízia, ktorá sa na nich aj skončí, sa čoskoro
     prestane robiť.

   Rozhodnutia sa preto do payloadu NEZAPISUJÚ. Vrátenie z čakania aj
   zamietnutie nápadu už žijú v databáze; druhá kópia v odpovediach by sa
   s ňou po prvom zásahu z inej obrazovky rozišla a nikto by nevedel, ktorá
   z nich klame.

   Rolovanie rieši kostra — obsah kroku je v nej v `overflow-y-auto` s pevným
   stropom. Zoznamy tu preto zámerne NEMAJÚ vlastný `overflow`: druhý posuvník
   vnorený v prvom je na dotyku prakticky neovládateľný. Naša úloha je len
   nedať im pevnú výšku a nechať dlhé názvy zalomiť.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Odpoveď na otázku „pohol sa tento týždeň?“. */
type ProjectAnswer = "moved" | "stuck";

const PROJECT_ANSWERS = ["moved", "stuck"] as const;

/** Ako dopadol prechod cez jednu blokovanú úlohu. Žije len počas sedenia. */
type WaitingMark = "released" | "still";

/** Ako dopadol jeden nápad z inkubátora. Žije len počas sedenia. */
type IdeaMark = "kept" | "rejected";

/**
 * Kľúče v odpovediach. Čítať ich bude mesačná revízia aj štatistiky v M7,
 * takže sa nemenia bezdôvodne — starý uložený rituál by si prestal rozumieť
 * s novým kódom a odpovede by ticho zmizli.
 */
const KEY_PROJECT_MOVES = "projectMoves";
const KEY_GOOD = "good";

export interface WeeklyReviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: RitualPeriod;
  /** Dnešok z pásma používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
  /** Rozrobené odpovede zo servera, ak sa revízia už začala. */
  initialPayload?: RitualPayload;
  /** Nezatriedené úlohy — `getInboxTasks`. */
  inbox: TaskWithRelations[];
  /** Blokované úlohy v stave `waiting` — `getWaitingTasks`. */
  waiting: TaskWithRelations[];
  /** Odložené na neurčito — `getSomedayTasks`. */
  someday: TaskWithRelations[];
  /** Najdlhšie nedotknuté nápady — `getIncubatorIdeas`, zvyčajne tri. */
  incubatorIdeas: IncubatorItem[];
  /** Projekty s počtami — `listProjects`. Neaktívne si odfiltrujeme sami. */
  projects: ProjectWithCounts[];
  /**
   * Všetko, čo sa v tomto týždni dokončilo — `getCompletedInPeriod` nad tým
   * istým obdobím, aké nesie `period`. Zoznam sa iba číta; win report je jediný
   * krok revízie, ktorý sa na nič nepýta.
   */
  completed: TaskWithRelations[];
}

export function WeeklyReview({
  open,
  onOpenChange,
  period,
  todayIso,
  initialPayload,
  inbox,
  waiting,
  someday,
  incubatorIdeas,
  projects,
  completed,
}: WeeklyReviewProps) {
  /*
    Prechod cez zoznamy žije v pamäti komponentu, nie v odpovediach. Je to
    záznam o jednom sedení („túto som už videl“), nie fakt o úlohe — uložiť ho
    by znamenalo, že o týždeň sa revízia otvorí s polovicou riadkov stlmených
    bez toho, aby na to bol dôvod. Server ich prekreslí až po zavretí dialógu,
    takže sa riadok medzitým musí upokojiť sám.
  */
  const [waitingMarks, setWaitingMarks] = useState<Record<string, WaitingMark>>({});
  const [ideaMarks, setIdeaMarks] = useState<Record<string, IdeaMark>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /*
    Archivovaný ani zavretý projekt sa nepýta, či sa pohol — odpoveď na to je
    už v jeho stave. Filtrujeme tu a nie na serveri preto, že `listProjects`
    plní aj výbery, kde sú `on_hold` projekty naopak potrebné.
  */
  const activeProjects = projects.filter(
    (project) => project.status === "active" && project.archivedAt === null,
  );

  /*
    Dokončené veci rozdelené podľa oblasti. Oblasť je jediné delenie, ktoré si
    win report dovolí: „päť vecí okolo domu a dve v práci“ je príbeh týždňa,
    kým čokoľvek jemnejšie by z odmeny spravilo výkaz.
  */
  const winGroups = groupByArea(completed);
  /*
    Nadpis „Bez oblasti“ dáva zmysel len vtedy, keď je oproti čomu vymedzený.
    Keď oblasť nemá ani jedna úloha, je to jeden nerozdelený zoznam a nadpis
    nad celým zoznamom by len tvrdil, že niečo chýba.
  */
  const hasNamedAreas = winGroups.some((group) => group.area !== null);

  /**
   * Úloha, na ktorú sa už čakať nemusí.
   *
   * Riadok sa stlmí okamžite a pri zlyhaní sa vráti späť: server prekreslí
   * zoznamy až po zavretí dialógu, takže odozvu si musí riadok obslúžiť sám.
   */
  function releaseWaiting(task: TaskWithRelations): void {
    setWaitingMarks((current) => ({ ...current, [task.id]: "released" }));
    setRowError(null);

    startTransition(async () => {
      const revert = (message: string): void => {
        setWaitingMarks((current) => {
          const next = { ...current };
          delete next[task.id];
          return next;
        });
        setRowError(message);
      };

      try {
        // `setWaiting(id, false)` vráti úlohu tam, kde je vidieť: so dňom
        // `todo`, bez neho `inbox`. Rieši to serverová akcia — dopočítavať si
        // to tu by znamenalo druhú kópiu pravidla, ktoré sa raz rozíde.
        const result = await setWaiting(task.id, false);
        if (!result.ok) {
          revert(result.error || "Úlohu sa nepodarilo vrátiť do práce.");
        }
      } catch {
        revert("Úlohu sa nepodarilo vrátiť do práce.");
      }
    });
  }

  /** Rozhodnutie o jednom nápade z inkubátora. */
  function decideIdea(ideaId: string, mark: IdeaMark): void {
    setIdeaMarks((current) => ({ ...current, [ideaId]: mark }));
    setRowError(null);

    startTransition(async () => {
      const revert = (message: string): void => {
        setIdeaMarks((current) => {
          const next = { ...current };
          delete next[ideaId];
          return next;
        });
        setRowError(message);
      };

      try {
        // `touchIdea` len osvieži hodiny zrenia — nápad sa tým vráti do hry
        // a ak bol vyblednutý, práve týmto dotykom obživne.
        const result =
          mark === "rejected"
            ? await setIdeaStage(ideaId, "rejected")
            : await touchIdea(ideaId);
        if (!result.ok) revert(result.error || "Rozhodnutie sa nepodarilo uložiť.");
      } catch {
        revert("Rozhodnutie sa nepodarilo uložiť.");
      }
    });
  }

  const steps: RitualStep[] = [
    /* ─────────────────────────────────────────────────────────────────────
       1. INBOX NA NULU
       ───────────────────────────────────────────────────────────────────── */
    {
      key: "inbox",
      title: "Inbox na nulu",
      hint: "Nezatriedená vec je záväzok, o ktorom si sa ešte nerozhodol. Cieľ je nula, nie „málo“.",
      render: () => (
        <div className="flex min-w-0 flex-col gap-3">
          {inbox.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-success">
              Inbox je prázdny. Presne o toto tu ide — nič nečaká na rozhodnutie
              a týždeň začínaš s čistou hlavou.
            </p>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Čaká {taskCountLabel(inbox.length)}. Triedi sa v inboxe, nie tu —
                revízia len pripomína, že sa to má stať dnes.
              </p>

              <ul className="flex min-w-0 flex-col gap-1.5">
                {inbox.map((task) => (
                  <li key={task.id} className={ritualRowClass}>
                    <span className="min-w-0 text-sm leading-snug break-words text-fg">
                      {task.title}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <RitualLink
            href="/inbox"
            Icon={Inbox}
            label={inbox.length === 0 ? "Otvoriť inbox" : "Zatriediť inbox"}
          />

          {someday.length > 0 ? (
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Bokom v „Niekedy“ leží {taskCountLabel(someday.length)}. Netreba ich
              riešiť — stačí sa pozrieť, či niektorá už nedozrela na tento týždeň.{" "}
              <Link
                href="/niekedy"
                className="font-medium text-accent underline underline-offset-2"
              >
                Otvoriť Niekedy
              </Link>
            </p>
          ) : null}
        </div>
      ),
    },

    /* ─────────────────────────────────────────────────────────────────────
       2. ČAKÁ SA NA
       ───────────────────────────────────────────────────────────────────── */
    {
      key: "waiting",
      title: "Čaká sa na",
      hint: "Pri každej sa spýtaj, či sa už niečo pohlo. Čakanie, ktoré nikto nekontroluje, je len tichý odklad.",
      render: () => (
        <div className="flex min-w-0 flex-col gap-2">
          {waiting.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-success">
              Nečakáš na nikoho. Všetko, čo beží, máš vo vlastných rukách.
            </p>
          ) : (
            waiting.map((task) => {
              const mark = waitingMarks[task.id];
              return (
                <div
                  key={task.id}
                  className={cn(
                    ritualRowClass,
                    "flex-col gap-2",
                    mark === "released" && "border-success",
                    mark === "still" && "opacity-70",
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="min-w-0 text-sm leading-snug break-words text-fg">
                      {task.title}
                    </p>
                    {task.note ? (
                      <p className="min-w-0 text-[12px] leading-relaxed break-words text-fg-muted">
                        {task.note}
                      </p>
                    ) : null}
                  </div>

                  {mark === undefined ? (
                    <>
                      <p className="text-[12px] leading-relaxed text-fg-muted">
                        Pohlo sa už niečo?
                      </p>
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        <ChoiceButton
                          Icon={CheckCheck}
                          label="Už sa pohlo"
                          tone="success"
                          ariaLabel={`Už sa pohlo — vrátiť do práce: ${task.title}`}
                          onClick={() => releaseWaiting(task)}
                        />
                        <ChoiceButton
                          Icon={Hourglass}
                          label="Stále čakám"
                          ariaLabel={`Stále čakám: ${task.title}`}
                          // Nič sa nemení, riadok sa len stlmí. Prechod cez
                          // zoznam potrebuje značku „videl som to“, inak sa pri
                          // dvanástich úlohách nedá udržať, kde človek skončil.
                          onClick={() =>
                            setWaitingMarks((current) => ({
                              ...current,
                              [task.id]: "still",
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <p
                      className={cn(
                        "text-[12px] leading-relaxed",
                        mark === "released" ? "text-success" : "text-fg-subtle",
                      )}
                    >
                      {mark === "released"
                        ? "Vrátené do práce."
                        : "Ostáva v čakaní."}
                    </p>
                  )}
                </div>
              );
            })
          )}

          {rowError ? (
            <p className="text-[13px] leading-relaxed text-danger">{rowError}</p>
          ) : null}
        </div>
      ),
    },

    /* ─────────────────────────────────────────────────────────────────────
       3. PROJEKTY
       ───────────────────────────────────────────────────────────────────── */
    {
      key: "projects",
      title: "Projekty",
      hint: "Pohol sa tento týždeň, alebo len leží? Odpoveď nič nemení — je to poznámka pre teba a pre mesačnú revíziu.",
      render: (context) => {
        const answers = readAnswers(context.payload, KEY_PROJECT_MOVES, PROJECT_ANSWERS);
        const stuckCount = Object.values(answers).filter((a) => a === "stuck").length;

        return (
          <div className="flex min-w-0 flex-col gap-2">
            {activeProjects.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Žiadne aktívne projekty. Prázdny zoznam projektov nie je chyba —
                úloha bez projektu je stále úloha.
              </p>
            ) : (
              <>
                {activeProjects.map((project) => {
                  const answer = answers[project.id];
                  return (
                    <div
                      key={project.id}
                      className={cn(
                        ritualRowClass,
                        "flex-col gap-2",
                        answer === "stuck" && "border-warn",
                      )}
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="min-w-0 text-sm leading-snug break-words text-fg">
                          {project.name}
                        </p>
                        <p className="min-w-0 text-[12px] leading-relaxed text-fg-muted">
                          {openTaskLabel(project.openTaskCount)}
                          {project.nextDueDate
                            ? ` · najbližší termín ${dueLabel(project.nextDueDate, todayIso)}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        <ChoiceButton
                          Icon={TrendingUp}
                          label="Pohol sa"
                          tone="success"
                          active={answer === "moved"}
                          ariaLabel={`Projekt ${project.name} sa tento týždeň pohol`}
                          onClick={() =>
                            context.setValue(
                              KEY_PROJECT_MOVES,
                              toggleAnswer(answers, project.id, "moved"),
                            )
                          }
                        />
                        <ChoiceButton
                          Icon={Pause}
                          label="Stojí"
                          tone="warn"
                          active={answer === "stuck"}
                          ariaLabel={`Projekt ${project.name} stojí`}
                          onClick={() =>
                            context.setValue(
                              KEY_PROJECT_MOVES,
                              toggleAnswer(answers, project.id, "stuck"),
                            )
                          }
                        />
                      </div>
                    </div>
                  );
                })}

                {stuckCount > 0 ? (
                  <p className="text-[13px] leading-relaxed text-fg-muted">
                    Stojí {stuckCount} z {activeProjects.length}. Projekt, ktorý
                    stojí druhý týždeň, potrebuje najbližší krok — alebo koniec.
                  </p>
                ) : null}
              </>
            )}
          </div>
        );
      },
    },

    /* ─────────────────────────────────────────────────────────────────────
       4. TRI NÁPADY Z INKUBÁTORA
       ───────────────────────────────────────────────────────────────────── */
    {
      key: "ideas",
      title: "Tri nápady z inkubátora",
      hint: "Každý odtiaľto odíde jedným rozhodnutím. Pripomienka bez rozhodnutia je len ďalšie okno, ktoré sa zavrie.",
      render: () => (
        <div className="flex min-w-0 flex-col gap-2">
          {incubatorIdeas.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Inkubátor je prázdny — nič nečaká dosť dlho na to, aby sa ozvalo.
            </p>
          ) : (
            incubatorIdeas.map(({ idea, ageDays }) => {
              const mark = ideaMarks[idea.id];
              const title = idea.title.trim();

              return (
                <div
                  key={idea.id}
                  className={cn(
                    ritualRowClass,
                    "flex-col gap-2",
                    mark !== undefined && "opacity-70",
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="min-w-0 text-sm leading-snug break-words text-fg">
                      {title}
                    </p>
                    <p className="min-w-0 text-[12px] leading-relaxed text-fg-muted">
                      Napadlo ťa to {agoLabel(ageDays)} · {touchAgeLabel(idea.staleDays)}
                    </p>
                  </div>

                  {mark === undefined ? (
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      <ChoiceButton
                        Icon={Hourglass}
                        label="Nechať zrieť"
                        ariaLabel={`Nechať nápad ${title} ďalej zrieť`}
                        onClick={() => decideIdea(idea.id, "kept")}
                      />
                      <ChoiceButton
                        Icon={Ban}
                        label="Zamietnuť"
                        tone="danger"
                        ariaLabel={`Zamietnuť nápad ${title}`}
                        onClick={() => decideIdea(idea.id, "rejected")}
                      />
                      {/*
                        Povýšenie tu tlačidlo nemá zámerne: potrebuje oblasť
                        a prvý krok, teda vlastný dialóg na obrazovke nápadov.
                        Odchod z revízie je pritom bezpečný — tento krok píše
                        iba do databázy a odpovede predošlých krokov už kostra
                        uložila pri prechode ďalej.
                      */}
                      <RitualLink
                        href="/napady"
                        Icon={Rocket}
                        label="Povýšiť"
                        title="Povýšenie má vlastný dialóg na obrazovke nápadov"
                      />
                    </div>
                  ) : (
                    <p
                      className={cn(
                        "text-[12px] leading-relaxed",
                        mark === "rejected" ? "text-danger" : "text-fg-subtle",
                      )}
                    >
                      {mark === "rejected"
                        ? "Zamietnuté. Ostáva v zázname, ale prestane sa hlásiť."
                        : "Necháva sa zrieť. Ozve sa zas o nejaký čas."}
                    </p>
                  )}
                </div>
              );
            })
          )}

          {rowError ? (
            <p className="text-[13px] leading-relaxed text-danger">{rowError}</p>
          ) : null}
        </div>
      ),
    },

    /* ─────────────────────────────────────────────────────────────────────
       5. ČO BOLO DOBRÉ
       ───────────────────────────────────────────────────────────────────── */
    {
      key: "good",
      title: "Čo bolo dobré?",
      hint: `Týždeň ${formatDayMonthSk(period.start)} – ${formatDayMonthSk(period.end)}. Jedna vec, ktorá vyšla — revízia, ktorá končí zoznamom nesplneného, sa čoskoro prestane robiť.`,
      render: (context) => (
        <div className="flex min-w-0 flex-col gap-2">
          {/*
            Natívny `textarea` a nie `Input`: týždeň sa do jedného riadku
            nezmestí a vlastný primitív by znamenal zasahovať mimo tohto
            míľnika. Triedy sú preto zhodné s `Input`, len bez pevnej výšky.
            `text-base` pod `sm:` je povinné — 16 px je hranica, pod ktorou
            iOS pri fokuse priblíži celú stránku.
          */}
          <textarea
            value={readText(context.payload, KEY_GOOD)}
            onChange={(event) => context.setValue(KEY_GOOD, event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Napr. konečne som zavrel projekt, ktorý sa vliekol od jari"
            className={cn(
              "min-h-24 w-full min-w-0 resize-y rounded border border-border bg-surface px-2.5 py-2",
              "text-base leading-relaxed text-fg placeholder:text-fg-subtle sm:text-sm",
              "transition-colors duration-100 ease-out hover:border-border-strong",
            )}
          />
          <p className="text-[12px] leading-relaxed text-fg-subtle">
            Nikam sa to neposiela. O mesiac to bude jediný doklad o tom, že sa
            niečo naozaj podarilo.
          </p>
        </div>
      ),
    },

    /* ─────────────────────────────────────────────────────────────────────
       6. WIN REPORT — ČO SI TENTO TÝŽDEŇ DOKÁZAL

       Odmena, nie výkaz. Preto tu zámerne nie je ani graf, ani percento, ani
       porovnanie s minulým týždňom: každé z nich vie povedať „menej než
       predtým“ a týždeň, v ktorom sa nedarilo, netreba dobíjať práve na konci
       revízie. Ostáva číslo a mená vecí, ktoré sú hotové.
       ───────────────────────────────────────────────────────────────────── */
    {
      key: "wins",
      title: "Čo si tento týždeň dokázal",
      hint: "Len na čítanie. Päť krokov predtým sa pýtalo na nedotiahnuté veci — toto je tá druhá polovica pravdy.",
      render: () => (
        <div className="flex min-w-0 flex-col gap-3">
          {completed.length === 0 ? (
            /*
              Veľká nula sa tu nevykresľuje. Číslo v ráme je odmena a odmena za
              nulu je výčitka — v prázdnom týždni preto ostáva len veta, nie
              skóre.
            */
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Tento týždeň tu nesvieti nič — a nie je to výčitka. Do zoznamu sa
              dostane len to, čo v ňom aj začalo, a väčšina toho, čo deň zoberie,
              sa doň nikdy nezapíše. Prázdny týždeň občas znamená len to, že sa
              žilo mimo zoznamu.
            </p>
          ) : (
            <>
              <div className="min-w-0 rounded border border-border bg-accent-soft px-3 py-3">
                <p className="text-3xl font-semibold leading-none tabular-nums text-accent">
                  {completed.length}
                </p>
                <p className="pt-1.5 text-[13px] leading-relaxed text-fg-muted">
                  {doneTaskLabel(completed.length)} za tento týždeň
                </p>
              </div>

              {winGroups.map((group) => (
                <div
                  key={group.area?.id ?? NO_AREA_KEY}
                  className="flex min-w-0 flex-col gap-1.5"
                >
                  {group.area !== null ? (
                    // `AreaDot` už nesie farbu aj čitateľný popis pre čítačku,
                    // takže nadpis skupiny nepotrebuje nič navyše — len silnejšiu
                    // farbu textu, aby sa odlíšil od riadkov pod ním.
                    <AreaDot
                      color={group.area.color}
                      name={group.area.name}
                      size="sm"
                      className="text-[12px] font-medium text-fg"
                    />
                  ) : hasNamedAreas ? (
                    <p className="text-[12px] font-medium text-fg-subtle">
                      Bez oblasti
                    </p>
                  ) : null}

                  <ul className="flex min-w-0 flex-col gap-1.5">
                    {group.tasks.map((task) => (
                      <li key={task.id} className={ritualRowClass}>
                        <span className="min-w-0 text-sm leading-snug break-words text-fg">
                          {task.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <RitualShell
      type="weekly"
      period={period}
      open={open}
      onOpenChange={onOpenChange}
      steps={steps}
      {...(initialPayload ? { initialPayload } : {})}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ČÍTANIE ODPOVEDÍ

   Payload je `jsonb` a prichádza z databázy, takže mu nemožno veriť: rozrobená
   revízia mohla vzniknúť pod starším kódom a niesť tvar, ktorý dnes neplatí.
   Neznáme hodnoty sa preto ticho zahodia — pretypovať ich a spoľahnúť sa na to
   by znamenalo pád až pri vykreslení, teda uprostred rituálu.
   ═══════════════════════════════════════════════════════════════════════════ */

function readAnswers<T extends string>(
  payload: RitualPayload,
  key: string,
  allowed: readonly T[],
): Record<string, T> {
  const raw = payload[key];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: Record<string, T> = {};
  for (const [id, value] of Object.entries(raw)) {
    const match = allowed.find((option) => option === value);
    if (match !== undefined) result[id] = match;
  }
  return result;
}

function readText(payload: RitualPayload, key: string): string {
  const raw = payload[key];
  return typeof raw === "string" ? raw : "";
}

/**
 * Prepnutie odpovede. Druhé kliknutie na tú istú voľbu ju zruší — človek si
 * má môcť vziať odpoveď späť bez toho, aby musel hádať, ktoré tlačidlo je
 * „žiadna z týchto“.
 */
function toggleAnswer(
  answers: Record<string, ProjectAnswer>,
  id: string,
  value: ProjectAnswer,
): Record<string, ProjectAnswer> {
  const next = { ...answers };
  if (next[id] === value) delete next[id];
  else next[id] = value;
  return next;
}

/**
 * Slovenské skloňovanie: 1 úloha · 2–4 úlohy · 0 a 5+ úloh.
 *
 * Rovnaké pravidlo si píše aj hlavička odkladiska. Zdieľať ho zatiaľ nemá kde:
 * je to gramatika konkrétneho slova, nie kontrakt — a spoločný „pluralSk“
 * s tromi tvarmi na vstupe sa číta horšie než tri riadky tu.
 */
function taskCountLabel(count: number): string {
  if (count === 1) return "1 úloha";
  if (count >= 2 && count <= 4) return `${count} úlohy`;
  return `${count} úloh`;
}

/** Prívlastok mení tvar spolu s číslom, preto zvlášť od `taskCountLabel`. */
function openTaskLabel(count: number): string {
  if (count === 1) return "1 otvorená úloha";
  if (count >= 2 && count <= 4) return `${count} otvorené úlohy`;
  return `${count} otvorených úloh`;
}

/**
 * Tvar mena k počtu dokončených úloh — bez samotného čísla.
 *
 * Vo win reporte stojí číslo samo a vo veľkom; keby ho niesol aj popis pod ním,
 * bolo by na jednej kartičke dvakrát a pri každej zmene by sa museli opraviť
 * obe miesta.
 */
function doneTaskLabel(count: number): string {
  if (count === 1) return "dokončená úloha";
  if (count >= 2 && count <= 4) return "dokončené úlohy";
  return "dokončených úloh";
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZOSKUPENIE PRE WIN REPORT
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Kľúč skupiny bez oblasti pre React. Zámerne taký, aký sa nedá pomýliť
 * so skutočným `id` oblasti — pri zhode by React po pridaní oblasti prekreslil
 * cudzí zoznam namiesto toho, aby skupinu založil nanovo.
 */
const NO_AREA_KEY = "__bez-oblasti__";

interface WinGroup {
  /** `null` pre úlohy, ktoré oblasť nemajú. */
  area: { id: string; name: string; color: string } | null;
  tasks: TaskWithRelations[];
}

/**
 * Dokončené úlohy podľa oblasti, úlohy bez nej na konci.
 *
 * Poradie skupín kopíruje poradie zo servera a zámerne sa neradí podľa počtu:
 * rebríček oblastí by z odmeny spravil súťaž, v ktorej jedna časť života vždy
 * prehráva. Úlohy bez oblasti idú nakoniec preto, že sú zvyšok, nie skupina.
 */
function groupByArea(tasks: TaskWithRelations[]): WinGroup[] {
  const byArea = new Map<string, WinGroup>();
  const loose: TaskWithRelations[] = [];

  for (const task of tasks) {
    if (task.area === null) {
      loose.push(task);
      continue;
    }
    const group = byArea.get(task.area.id);
    if (group === undefined) byArea.set(task.area.id, { area: task.area, tasks: [task] });
    else group.tasks.push(task);
  }

  const groups = [...byArea.values()];
  if (loose.length > 0) groups.push({ area: null, tasks: loose });
  return groups;
}

/**
 * Termín projektu voči dnešku. `todayIso` chodí propom zo servera — počítať si
 * dnešok v klientovi cez `new Date()` by po polnoci (a v inom pásme kedykoľvek)
 * dalo iné číslo pred hydratáciou a po nej.
 */
function dueLabel(dueIso: string, todayIso: string): string {
  const days = diffDays(todayIso, dueIso);
  if (days < 0) return `${formatDayMonthSk(dueIso)} (po termíne)`;
  if (days === 0) return "dnes";
  if (days === 1) return "zajtra";
  return formatDayMonthSk(dueIso);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRVKY RIADKA
   ═══════════════════════════════════════════════════════════════════════════ */

type ChoiceTone = "default" | "success" | "warn" | "danger";

const TONE_CLASS: Record<ChoiceTone, { idle: string; active: string }> = {
  default: {
    idle: "border-border text-fg hover:border-border-strong hover:bg-surface-2",
    active: "border-accent bg-accent-soft font-medium text-accent",
  },
  success: {
    idle: "border-border text-fg hover:border-success hover:text-success",
    active: "border-success bg-accent-soft font-medium text-success",
  },
  warn: {
    idle: "border-border text-fg hover:border-warn hover:text-warn",
    active: "border-warn bg-accent-soft font-medium text-warn",
  },
  danger: {
    idle: "border-border text-fg hover:border-danger hover:text-danger",
    active: "border-danger bg-accent-soft font-medium text-danger",
  },
};

/**
 * Voľba v riadku. Pod `sm:` má 44 px, aby sa dala trafiť palcom; od `sm:` sa
 * zmenší, lebo myš takú rezervu nepotrebuje a revízia je hustý zoznam.
 */
function ChoiceButton({
  Icon,
  label,
  ariaLabel,
  onClick,
  tone = "default",
  active,
}: {
  Icon: LucideIcon;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  tone?: ChoiceTone;
  active?: boolean;
}) {
  const classes = TONE_CLASS[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      // `aria-pressed` len tam, kde je voľba prepínač (projekty). Pri
      // jednorazovom rozhodnutí by čítačka hlásila stav, ktorý neexistuje.
      {...(active === undefined ? {} : { "aria-pressed": active })}
      className={cn(
        "inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded border bg-surface px-2.5",
        "text-[13px] transition-colors duration-100 ease-out sm:min-h-8",
        active ? classes.active : classes.idle,
      )}
    >
      <Icon aria-hidden="true" size={14} className="shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

/**
 * Odkaz mimo rituálu. Vyzerá ako voľba, ale správa sa ako odkaz — kvôli
 * strednému kliknutiu, otvoreniu na novej karte a čítačkám, ktoré si odkazy
 * a tlačidlá vypisujú zvlášť.
 */
function RitualLink({
  href,
  Icon,
  label,
  title,
}: {
  // `Route`, nie `string` — `typedRoutes` overuje ciele odkazov pri preklade.
  href: Route;
  Icon: LucideIcon;
  label: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      {...(title ? { title } : {})}
      className={cn(
        "inline-flex min-h-11 w-fit min-w-0 items-center gap-1.5 rounded border border-border",
        "bg-surface px-2.5 text-[13px] font-medium text-fg",
        "transition-colors duration-100 ease-out hover:border-border-strong hover:bg-surface-2",
        "sm:min-h-8",
      )}
    >
      <Icon aria-hidden="true" size={14} className="shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
      <ArrowUpRight aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
    </Link>
  );
}

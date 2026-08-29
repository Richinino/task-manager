"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";

import { diffDays, formatDayMonthSk } from "@/lib/dates";
import type { RitualPeriod } from "@/lib/rituals";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PostponeBadge } from "@/components/task/postpone-badge";
import {
  RitualShell,
  ritualRowClass,
  type RitualPayload,
  type RitualStep,
  type RitualStepContext,
} from "@/components/rituals/ritual-shell";
import { deleteTask } from "@/server/actions/tasks";
import type { ProjectWithCounts } from "@/server/queries/structure";
import type { TaskWithRelations } from "@/server/queries/tasks";
import { pluralSk } from "@/lib/sk";

/* ═══════════════════════════════════════════════════════════════════════════
   MESAČNÁ REVÍZIA — 30 minút

   Štyri kroky: čo ťa brzdilo → čo sa nehýbe → čo sa podarilo → zámer.

   Jadrom je prvý krok. Dôvody odkladov sa od M5 zbierajú do `task_events.note`
   a doteraz ich nikto nečítal — mesačná revízia je jediné miesto, kde človek
   uvidí pokope, čo si sám o sebe za mesiac napísal. Preto sa vypisujú
   DOSLOVNE: bez skracovania, bez úpravy a bez hodnotenia zo strany appky.
   Zhrnúť ich do „vyhováraš sa" by bola najrýchlejšia cesta, ako človeka
   odnaučiť dôvody vôbec písať — a tým by sa celý M5 stal zberom prázdna.

   Do databázy siaha jediná vec: zahodenie úlohy v prvom kroku, a to HNEĎ, nie
   až na konci. Revízia trvá pol hodiny a zavrieť ju v polovici je bežné, takže
   rozhodnutie musí platiť v tej chvíli, keď padne.

   Druhý krok zámerne nemení nič. „Ukončiť projekt" je odpoveď do rituálu, nie
   archivácia: archív má vlastnú obrazovku, kde vidno, čo sa s úlohami stane.
   Ukončiť projekt naslepo z revízie by bola prekvapivá strata.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ako dopadla úloha, ktorá sa celý mesiac odkladala. */
type BlockerDecision = "dropped" | "kept";

/** Čo bude s projektom bez pohybu. Iba odpoveď do rituálu, nič v databáze. */
type StaleVerdict = "continue" | "shrink" | "end";

const BLOCKER_DECISIONS = ["dropped", "kept"] as const;
const STALE_VERDICTS = ["continue", "shrink", "end"] as const;

const STALE_CHOICES: { value: StaleVerdict; label: string }[] = [
  { value: "continue", label: "Pokračuje" },
  { value: "shrink", label: "Zúžiť" },
  { value: "end", label: "Ukončiť" },
];

export interface PostponedTask {
  task: TaskWithRelations;
  /**
   * Dôvody odkladov tak, ako ich človek napísal — `task_events.note` za mesiac,
   * od najstaršieho. Text sa cestou nikde neupravuje ani neskracuje.
   */
  reasons: string[];
}

export interface StaleProject {
  project: ProjectWithCounts;
  /**
   * Deň posledného pohybu v projekte; `null`, keď sa od založenia nestalo nič.
   * Počet dní si dopočíta komponent z `todayIso` — deň v prehliadači môže byť
   * iný než v pásme používateľa.
   */
  lastActivityDate: string | null;
}

export interface MonthlyJournalEntry {
  /** `YYYY-MM-DD` */
  date: string;
  body: string | null;
  /** 1–5, tá istá škála ako vo večernom rituáli. */
  mood: number | null;
}

export interface MonthlyReviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: RitualPeriod;
  /** Dnešok z pásma používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
  initialPayload?: RitualPayload;
  /** Najviac odkladané úlohy mesiaca aj s dôvodmi, od najhoršej. */
  mostPostponed: PostponedTask[];
  /** Projekty, v ktorých sa za mesiac nič nepohlo. */
  staleProjects: StaleProject[];
  /** Zápisy z denníka za mesiac, od najstaršieho. */
  journalEntries: MonthlyJournalEntry[];
  /** Koľko úloh sa za mesiac dokončilo. */
  completedCount: number;
  /**
   * `settings.postponeBlockAt` — od koľkých odkladov je počítadlo červené.
   * Prah patrí používateľovi, komponent si ho zo session neťahá sám.
   */
  postponeDangerAt?: number;
}

/**
 * Prečíta mapu rozhodnutí z odpovedí rituálu.
 *
 * `payload` je `jsonb` z databázy, takže sa doň mohlo dostať čokoľvek — starší
 * tvar odpovedí, polovičný zápis, ručný zásah. Neznáme hodnoty sa ticho
 * zahadzujú: spadnúť nad rozrobenou revíziou by bolo horšie než prísť o jednu
 * odpoveď, ktorej aj tak nerozumieme.
 */
function readVerdicts<T extends string>(
  payload: RitualPayload | undefined,
  key: string,
  allowed: readonly T[],
): Record<string, T> {
  const raw = payload?.[key];
  if (typeof raw !== "object" || raw === null) return {};

  const out: Record<string, T> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
      out[id] = value as T;
    }
  }
  return out;
}

/** Text z odpovedí. Čokoľvek iné než reťazec je pre nás prázdno. */
function readText(payload: RitualPayload | undefined, key: string): string {
  const raw = payload?.[key];
  return typeof raw === "string" ? raw : "";
}

export function MonthlyReview({
  open,
  onOpenChange,
  period,
  todayIso,
  initialPayload,
  mostPostponed,
  staleProjects,
  journalEntries,
  completedCount,
  postponeDangerAt,
}: MonthlyReviewProps) {
  const [rowError, setRowError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /**
   * Najnovšia mapa rozhodnutí o brzdách.
   *
   * Zahodenie potvrdzuje server a odpoveď môže doraziť až po tom, čo človek
   * rozhodne o ďalšej úlohe. Kópia zachytená v uzávere by pri vracaní späť
   * ticho zmazala to, čo medzitým pribudlo — preto tu stojí `ref`, ktorý je
   * vždy aktuálny. Vykresľuje sa naďalej z odpovedí rituálu, aby tú istú vec
   * nedržali dva stavy, ktoré sa môžu rozísť.
   */
  const blockersRef = useRef<Record<string, BlockerDecision>>(
    readVerdicts(initialPayload, "blockers", BLOCKER_DECISIONS),
  );

  /** Zápisy, v ktorých naozaj niečo je — prázdny riadok nie je spomienka. */
  const written = journalEntries.filter(
    (entry) => (entry.body?.trim() ?? "") !== "" || entry.mood !== null,
  );

  function decide(
    entry: PostponedTask,
    decision: BlockerDecision,
    setValue: RitualStepContext["setValue"],
  ): void {
    const write = (map: Record<string, BlockerDecision>): void => {
      blockersRef.current = map;
      setValue("blockers", map);
    };

    write({ ...blockersRef.current, [entry.task.id]: decision });
    setRowError(null);

    // „Nechať" je rozhodnutie, nie zmena. Do databázy nesiaha nič a stopa po
    // ňom ostáva jedine v odpovediach revízie — o to tu ide.
    if (decision !== "dropped") return;

    startTransition(async () => {
      const revert = (message: string): void => {
        const next = { ...blockersRef.current };
        delete next[entry.task.id];
        write(next);
        setRowError(message);
      };

      try {
        const result = await deleteTask(entry.task.id);
        if (!result.ok) revert(result.error || "Úlohu sa nepodarilo zahodiť.");
      } catch {
        revert("Úlohu sa nepodarilo zahodiť.");
      }
    });
  }

  const steps: RitualStep[] = [
    {
      key: "blockers",
      title: "Čo ťa brzdilo",
      hint: "Úlohy, ktoré si tento mesiac odkladal najviac — aj s dôvodmi, ktoré si vtedy napísal.",
      render: ({ payload, setValue }) => {
        const decisions = readVerdicts(payload, "blockers", BLOCKER_DECISIONS);

        return (
          <div className="flex flex-col gap-2">
            {mostPostponed.length === 0 ? (
              <p className="text-body leading-relaxed text-fg-muted">
                Tento mesiac si nič nevozil pred sebou. To je vzácne.
              </p>
            ) : (
              mostPostponed.map((entry) => {
                const decision = decisions[entry.task.id];

                return (
                  <div
                    key={entry.task.id}
                    className={cn(ritualRowClass, "flex-col gap-2")}
                  >
                    <div className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="min-w-0 flex-1 text-sm leading-snug text-fg">
                        {entry.task.title}
                      </p>
                      {entry.task.postponeCount > 0 ? (
                        // Prah je tu zámerne 1: v riadku úlohy je odznak signál
                        // „pozor", tu je to jediné číslo, ktoré vysvetľuje, prečo
                        // sa úloha v zozname vôbec ocitla.
                        <PostponeBadge
                          count={entry.task.postponeCount}
                          warnAt={1}
                          dangerAt={postponeDangerAt}
                          size="sm"
                        />
                      ) : null}
                    </div>

                    {entry.task.project ? (
                      <p className="min-w-0 text-meta text-fg-subtle">
                        {entry.task.project.name}
                      </p>
                    ) : null}

                    {/*
                      Dôvody doslovne. Žiadne skrátenie, žiadna úprava, žiadny
                      komentár — sú to vlastné slová človeka spred týždňov a
                      jediné, čo tu appka smie spraviť, je ukázať ich.
                      `whitespace-pre-wrap` drží aj zalomenia tak, ako ich napísal.
                      Kľúčom je poradie: dôvod je holý reťazec a dva rovnaké
                      („nemal som čas") sú v takomto zozname úplne bežné.
                    */}
                    {entry.reasons.length === 0 ? (
                      <p className="text-body leading-relaxed text-fg-subtle">
                        Bez zapísaného dôvodu.
                      </p>
                    ) : (
                      <ul className="flex min-w-0 flex-col gap-1.5 border-l-2 border-border pl-2.5">
                        {entry.reasons.map((reason, index) => (
                          <li
                            key={`${entry.task.id}:${index}`}
                            className="min-w-0 whitespace-pre-wrap break-words text-body leading-relaxed text-fg-muted"
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                    )}

                    {decision === undefined ? (
                      <div className="flex flex-wrap gap-1.5">
                        <RowButton
                          onClick={() => decide(entry, "dropped", setValue)}
                          Icon={Trash2}
                          label="Zahodiť"
                          danger
                        />
                        <RowButton
                          onClick={() => decide(entry, "kept", setValue)}
                          Icon={Check}
                          label="Nechať"
                        />
                      </div>
                    ) : (
                      <p
                        className={cn(
                          "text-body leading-relaxed",
                          decision === "dropped" ? "text-danger" : "text-fg-muted",
                        )}
                      >
                        {decision === "dropped" ? "Zahodené." : "Ostáva v hre."}
                      </p>
                    )}
                  </div>
                );
              })
            )}

            <div aria-live="polite">
              {rowError ? (
                <p className="text-body leading-relaxed text-danger">{rowError}</p>
              ) : null}
            </div>
          </div>
        );
      },
    },

    {
      key: "stale",
      title: "Čo sa nehýbe",
      hint: "Projekty bez pohybu. Nič sa tu nemení — je to poznámka pre teba, archivovať sa dá v projektoch.",
      render: ({ payload, setValue }) => {
        const verdicts = readVerdicts(payload, "stale", STALE_VERDICTS);

        return (
          <div className="flex flex-col gap-2">
            {staleProjects.length === 0 ? (
              <p className="text-body leading-relaxed text-fg-muted">
                Každý projekt sa tento mesiac aspoň raz pohol.
              </p>
            ) : (
              staleProjects.map((entry) => {
                const verdict = verdicts[entry.project.id];
                // Dni sa rátajú z dnešku, ktorý prišiel zo servera — hodiny
                // v prehliadači môžu byť v inom pásme a o polnoci by sa rozišli.
                const days =
                  entry.lastActivityDate === null
                    ? null
                    : diffDays(entry.lastActivityDate, todayIso);

                return (
                  <div
                    key={entry.project.id}
                    className={cn(ritualRowClass, "flex-col gap-2")}
                  >
                    <div className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="min-w-0 flex-1 text-sm leading-snug text-fg">
                        {entry.project.name}
                      </p>
                      <span className="shrink-0 text-meta text-warn">
                        {days === null
                          ? "zatiaľ bez pohybu"
                          : `${days} ${pluralSk(days, "deň", "dni", "dní")} bez pohybu`}
                      </span>
                    </div>

                    <p className="text-meta text-fg-subtle">
                      {entry.project.openTaskCount}{" "}
                      {pluralSk(
                        entry.project.openTaskCount,
                        "otvorená úloha",
                        "otvorené úlohy",
                        "otvorených úloh",
                      )}
                    </p>

                    <div
                      role="group"
                      aria-label={`Čo ďalej s projektom ${entry.project.name}`}
                      className="flex flex-wrap gap-1.5"
                    >
                      {STALE_CHOICES.map((choice) => {
                        const active = verdict === choice.value;
                        return (
                          <ChoiceButton
                            key={choice.value}
                            active={active}
                            label={choice.label}
                            onClick={() => {
                              const next = { ...verdicts };
                              // Druhé klepnutie odpoveď zruší. Zle klepnutá
                              // odpoveď by inak ostala v revízii navždy.
                              if (active) delete next[entry.project.id];
                              else next[entry.project.id] = choice.value;
                              setValue("stale", next);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      },
    },

    {
      key: "wins",
      title: "Čo sa podarilo",
      hint: "Len na čítanie. Po dvoch krokoch o brzdách patrí mesiacu aj druhá polovica pravdy.",
      render: () => (
        <div className="flex flex-col gap-3">
          <div className="rounded border border-border bg-accent-soft px-3 py-3">
            <p className="text-2xl font-semibold leading-none font-mono tabular-nums text-accent">
              {completedCount}
            </p>
            <p className="pt-1.5 text-body leading-relaxed text-fg-muted">
              {pluralSk(
                completedCount,
                "dokončená úloha",
                "dokončené úlohy",
                "dokončených úloh",
              )}{" "}
              za tento mesiac
            </p>
          </div>

          {written.length === 0 ? (
            <p className="text-body leading-relaxed text-fg-muted">
              Denník je tento mesiac prázdny. Napĺňa ho večerný rituál, po jednej vete.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {written.map((entry) => (
                <div
                  key={entry.date}
                  className={cn(ritualRowClass, "flex-col gap-1")}
                >
                  <div className="flex w-full items-baseline justify-between gap-2">
                    <span className="shrink-0 text-meta font-mono tabular-nums text-fg-subtle">
                      {formatDayMonthSk(entry.date)}
                    </span>
                    {entry.mood === null ? null : <MoodDots value={entry.mood} />}
                  </div>
                  {entry.body ? (
                    <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
                      {entry.body}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },

    {
      key: "intent",
      title: "Zámer na ďalší mesiac",
      hint: "Jedna veta. Zoznam predsavzatí sa nedodrží, jedna vec áno.",
      render: ({ payload, setValue }) => (
        <div className="flex flex-col gap-2">
          <Input
            value={readText(payload, "intent")}
            onChange={(event) => setValue("intent", event.target.value)}
            placeholder="Napr. dotiahnem nasadenie a nezačnem nič nové"
            maxLength={280}
            aria-label="Zámer na ďalší mesiac"
          />
          <p className="text-body leading-relaxed text-fg-subtle">
            O mesiac ju uvidíš hore v tejto istej revízii.
          </p>
        </div>
      ),
    },
  ];

  return (
    <RitualShell
      type="monthly"
      period={period}
      open={open}
      onOpenChange={onOpenChange}
      steps={steps}
      initialPayload={initialPayload}
    />
  );
}

/**
 * Nálada ako päť bodiek. „4/5" znie ako výkaz a mesiac sa má čítať cez vety,
 * nie cez skóre — bodka sa dá aj prehliadnuť, čo je tu prednosť.
 */
function MoodDots({ value }: { value: number }) {
  const filled = Math.min(Math.max(Math.round(value), 1), 5);
  const label = `nálada ${filled} z 5`;

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className="inline-flex shrink-0 items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            step <= filled ? "bg-accent" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

/** Akcia v riadku úlohy — rovnaký tvar ako vo večernom rituáli. */
function RowButton({
  onClick,
  Icon,
  label,
  danger,
}: {
  onClick: () => void;
  Icon: typeof Trash2;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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

/** Voľba, ktorá nikam nevolá — drží sa len v odpovediach rituálu. */
function ChoiceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded border px-3 text-body sm:min-h-8",
        "transition-colors duration-100 ease-out",
        active
          ? "border-accent bg-accent-soft font-medium text-accent"
          : "border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2",
      )}
    >
      {label}
    </button>
  );
}

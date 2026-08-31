"use client";

import { useState } from "react";

import { areaColorValue } from "@/components/task/area-dot";
import { WEEKDAYS_SK } from "@/lib/dates";
import { lessonState } from "@/lib/school";
import { cn } from "@/lib/utils";

import { LessonDetail } from "./lesson-detail";
import { useNowMinutes } from "./use-now-minutes";

/* ═══════════════════════════════════════════════════════════════════════════
   MRIEŽKA ROZVRHU

   **Deň je RIADOK, nie stĺpec.** Pondelok jeden riadok, utorok druhý. Na
   telefóne sa tak zmestí viac a dni sa čítajú zhora nadol ako všetko ostatné
   v appke; stĺpce by na 375 px stlačili každú hodinu na tri znaky.

   V okienku je len skratka a učebňa. Celé názvy sa tam nezmestia a človek
   skratky aj tak pozná — celé meno predmetu aj vyučujúceho je v detaile.

   Prešlé hodiny sú stlmené, prebiehajúca zvýraznená. **Nič sa pritom
   neukladá** — stav sa odvodí z času.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface GridLesson {
  id: string;
  date: string;
  period: number;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectColor: string;
  room: string | null;
  cancelled: boolean;
  hasNote: boolean;
}

export interface WeekGridProps {
  /** Dni týždňa ako `RRRR-MM-DD`, od pondelka. */
  days: readonly string[];
  lessons: readonly GridLesson[];
  todayIso: string;
  nowMin: number;
  timeZone: string;
}

export function WeekGrid({ days, lessons, todayIso, nowMin, timeZone }: WeekGridProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const teraz = useNowMinutes(nowMin, timeZone);

  /*
    Stĺpce sa odvodia z dát, nie z pevného zoznamu. Škola má nultú hodinu aj
    ôsmu a iná ich bude mať inak — pevný rozsah by buď kreslil prázdne stĺpce,
    alebo by hodinu zamlčal.
  */
  const periods = [...new Set(lessons.map((l) => l.period))].sort((a, b) => a - b);

  if (periods.length === 0) {
    return (
      <p className="px-5 py-6 text-body text-fg-muted">
        Zatiaľ tu nič nie je. Načítaj rozvrh zo súboru nižšie.
      </p>
    );
  }

  const casy = new Map<number, string>();
  for (const l of lessons) if (!casy.has(l.period)) casy.set(l.period, l.startTime);

  return (
    <div className="flex flex-col">
      {/* Mriežka sa na úzkej obrazovke roluje vodorovne, telo stránky nie. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-14 px-2 py-1.5 text-left">
                <span className="sr-only">Deň</span>
              </th>
              {periods.map((p) => (
                <th key={p} scope="col" className="px-1 py-1.5 text-left">
                  <span className="block font-mono text-micro font-medium text-fg-muted">
                    {p}.
                  </span>
                  <span className="block font-mono text-micro tabular-nums text-fg-subtle">
                    {casy.get(p)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {days.map((den) => {
              const denne = lessons.filter((l) => l.date === den);
              const dnesok = den === todayIso;

              return (
                <tr key={den} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-2 py-1 text-left align-top">
                    <span
                      className={cn(
                        "block text-mini font-medium",
                        dnesok ? "text-accent" : "text-fg-muted",
                      )}
                    >
                      {WEEKDAYS_SK[new Date(`${den}T12:00:00`).getDay()]?.slice(0, 2)}
                    </span>
                    <span className="block font-mono text-micro tabular-nums text-fg-subtle">
                      {den.slice(8)}.{den.slice(5, 7)}.
                    </span>
                  </th>

                  {periods.map((p) => {
                    const hodina = denne.find((l) => l.period === p);
                    if (hodina === undefined) {
                      return <td key={p} className="px-1 py-1" />;
                    }

                    const stav = lessonState(hodina, todayIso, teraz);

                    return (
                      <td key={p} className="px-1 py-1 align-top">
                        <button
                          type="button"
                          onClick={() => setOpenId(hodina.id)}
                          aria-label={popis(hodina, stav)}
                          title={popis(hodina, stav)}
                          className={cn(
                            "flex w-full min-w-[3.5rem] flex-col items-start gap-0.5 rounded border px-1.5 py-1 text-left",
                            "transition-colors duration-100 ease-out hover:border-border-strong hover:bg-surface-2",
                            stav === "now"
                              ? "border-accent bg-accent-soft"
                              : "border-border bg-surface",
                            stav === "past" && "opacity-55",
                          )}
                        >
                          <span className="flex w-full min-w-0 items-center gap-1">
                            <span
                              aria-hidden="true"
                              className="inline-block size-1.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor: areaColorValue(hodina.subjectColor),
                              }}
                            />
                            <span
                              className={cn(
                                "min-w-0 truncate text-mini font-medium text-fg",
                                hodina.cancelled &&
                                  "line-through decoration-fg-subtle",
                              )}
                            >
                              {hodina.subjectCode}
                            </span>
                            {hodina.hasNote ? (
                              <span
                                aria-hidden="true"
                                className="ml-auto text-micro text-accent"
                              >
                                ●
                              </span>
                            ) : null}
                          </span>

                          {hodina.room ? (
                            <span className="w-full truncate font-mono text-micro text-fg-subtle">
                              {hodina.room}
                            </span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <LessonDetail
        lessonId={openId}
        onClose={() => setOpenId(null)}
        todayIso={todayIso}
      />
    </div>
  );
}

/** Súhrn pre čítačku — farba ani prečiarknutie nesmú byť jediný nosič. */
function popis(lesson: GridLesson, stav: "past" | "now" | "future"): string {
  const casti = [
    `${lesson.period}. hodina`,
    lesson.subjectCode,
    `${lesson.startTime}–${lesson.endTime}`,
  ];

  if (lesson.room) casti.push(lesson.room);
  if (lesson.cancelled) casti.push("odpadla");
  else if (stav === "past") casti.push("prebehla");
  else if (stav === "now") casti.push("práve prebieha");
  if (lesson.hasNote) casti.push("má poznámku alebo úlohu");

  return casti.join(", ");
}

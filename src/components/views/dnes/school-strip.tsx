"use client";

import { useState } from "react";

import { areaColorValue } from "@/components/task/area-dot";
import { LessonDetail } from "@/components/views/rozvrh/lesson-detail";
import { useNowMinutes } from "@/components/views/rozvrh/use-now-minutes";
import { formatDuration, timeToMinutes } from "@/lib/dates";
import { lessonState, schoolMinutes, schoolWindow } from "@/lib/school";
import { countSk } from "@/lib/sk";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   ŠKOLA NA OBRAZOVKE „DNES"

   Pruh sedí MEDZI prioritou dňa a naplánovanými úlohami. Nie hore nad
   všetkým: priorita dňa ostáva prvá vec, ktorú človek ráno vidí, a škola je
   kontext k nej — „toto chcem spraviť a takto mám zabratý deň".

   **Nič sa tu neodškrtáva ručne.** Hodina je hotová vtedy, keď jej čas
   prešiel; pruh to len kreslí. Preto sa tu nedá nič pokaziť klikaním a preto
   je stav správny aj o týždeň, keď sa človek na ten deň pozrie znova.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SchoolStripLesson {
  id: string;
  /** Deň hodiny — pruh sa kreslí aj pri prezeraní iného dňa než dnešok. */
  date: string;
  period: number;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string | null;
  subjectColor: string;
  room: string | null;
  cancelled: boolean;
  /** Má na tú hodinu niečo visieť? Poznámka, úloha alebo písomka. */
  hasNote: boolean;
}

export interface SchoolStripProps {
  lessons: readonly SchoolStripLesson[];
  todayIso: string;
  /** Minúty od polnoci zo servera — klient si prvú hodnotu nepočíta. */
  nowMin: number;
  timeZone: string;
}

export function SchoolStrip({ lessons, todayIso, nowMin, timeZone }: SchoolStripProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const teraz = useNowMinutes(nowMin, timeZone);

  if (lessons.length === 0) return null;

  const okno = schoolWindow(lessons);
  const minut = schoolMinutes(lessons);

  /*
    Koľko zo školy ešte ostáva. Počíta sa z hodín, ktoré ešte neskončili —
    nie z okna, lebo v ňom sú aj prestávky a odpadnuté hodiny.

    Ide to cez `lessonState`, nie cez holé porovnanie časov: pruh sa kreslí aj
    pri prezeraní iného dňa a večerná hodina by inak zajtrajšiu školu vyhlásila
    za skončenú.
  */
  const zostava = lessons.reduce((sucet, l) => {
    if (l.cancelled) return sucet;
    const stav = lessonState(l, todayIso, teraz);
    if (stav === "past") return sucet;

    const zaciatok = timeToMinutes(l.startTime) ?? 0;
    const koniec = timeToMinutes(l.endTime) ?? zaciatok;
    return sucet + (koniec - (stav === "now" ? teraz : zaciatok));
  }, 0);

  /* „Zostáva" dáva zmysel len o dnešku — inde je to obyčajný súčet. */
  const jeDnes = lessons.some((l) => l.date === todayIso);

  return (
    <section
      aria-label="Škola dnes"
      className="flex shrink-0 flex-col gap-1.5 border-b border-border px-5 py-[11px]"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="label text-fg-subtle">Škola</h2>

        {okno !== null ? (
          <span className="font-mono text-mini tabular-nums text-fg-muted">
            {okno.start}–{okno.end}
          </span>
        ) : null}

        <span className="font-mono text-mini tabular-nums text-fg-muted">
          · {countSk(lessons.length, "hodina", "hodiny", "hodín")}
          {minut > 0 ? ` · ${formatDuration(minut)}` : ""}
        </span>

        {jeDnes ? (
          zostava > 0 ? (
            <span className="ml-auto font-mono text-mini tabular-nums text-fg-muted">
              zostáva {formatDuration(zostava)}
            </span>
          ) : (
            <span className="ml-auto font-mono text-mini text-fg-subtle">
              škola skončila
            </span>
          )
        ) : null}
      </div>

      {/*
        Vodorovný zoznam, ktorý sa na úzkej obrazovke roluje sám. Zalamovať
        ho by znamenalo, že poradie hodín prestane byť čitateľné zľava doprava.
      */}
      <ul className="-mx-1 flex items-stretch gap-1 overflow-x-auto px-1 pb-0.5">
        {lessons.map((lesson) => {
          const stav = lessonState(lesson, todayIso, teraz);

          return (
            <li key={lesson.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setOpenId(lesson.id)}
                aria-label={popis(lesson, stav)}
                title={popis(lesson, stav)}
                className={cn(
                  "flex min-h-11 w-[4.25rem] flex-col items-start justify-center gap-0.5 rounded border px-2 py-1 sm:min-h-9",
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
                    style={{ backgroundColor: areaColorValue(lesson.subjectColor) }}
                  />
                  <span
                    className={cn(
                      "min-w-0 truncate text-mini font-medium text-fg",
                      lesson.cancelled && "line-through decoration-fg-subtle",
                    )}
                  >
                    {lesson.subjectCode}
                  </span>
                  {lesson.hasNote ? (
                    <span aria-hidden="true" className="ml-auto text-micro text-accent">
                      ●
                    </span>
                  ) : null}
                </span>

                <span className="w-full truncate font-mono text-micro tabular-nums text-fg-subtle">
                  {stav === "past" ? "✓ " : stav === "now" ? "▶ " : ""}
                  {lesson.startTime}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <LessonDetail
        lessonId={openId}
        onClose={() => setOpenId(null)}
        todayIso={todayIso}
      />
    </section>
  );
}

/** Súhrn pre čítačku — znak ✓ ani farba nesmú byť jediný nosič informácie. */
function popis(lesson: SchoolStripLesson, stav: "past" | "now" | "future"): string {
  const casti = [
    `${lesson.period}. hodina`,
    lesson.subjectName ?? lesson.subjectCode,
    `${lesson.startTime}–${lesson.endTime}`,
  ];

  if (lesson.room) casti.push(lesson.room);
  if (lesson.cancelled) casti.push("odpadla");
  else if (stav === "past") casti.push("prebehla");
  else if (stav === "now") casti.push("práve prebieha");
  if (lesson.hasNote) casti.push("má poznámku alebo úlohu");

  return casti.join(", ");
}

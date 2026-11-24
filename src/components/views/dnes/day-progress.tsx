"use client";

import { useMemo } from "react";

import { DayStrip } from "@/components/timeline/day-strip";
import { useNowMinutes } from "@/components/views/rozvrh/use-now-minutes";
import { formatDuration } from "@/lib/dates";
import { layoutDay, type TimelineInput } from "@/lib/day-timeline";

/* ═══════════════════════════════════════════════════════════════════════════
   PRIEBEH DŇA (počítač)

   Celý deň na jeden pohľad: škola, udalosti, úlohy položené do voľných
   miest a čiara „teraz". Je to ten istý pás ako na telefóne pod kartou,
   len väčší a s popismi — na počítači je naň miesto a odpovedá na otázku,
   ktorú si pri pohľade na zoznam kladieš: zmestí sa to ešte?

   „Teraz" je živé: hodiny bežia v prehliadači, server dodá len prvý údaj.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DayProgressProps {
  timeline: Omit<TimelineInput, "nowMin">;
  /** Minúty od polnoci zo servera — prvý údaj pre živé „teraz". */
  nowMin: number;
  timeZone: string;
  /** Pri inom dni než dnešok nič nie je minulé a čiara „teraz" sa nekreslí. */
  isToday: boolean;
}

function clock(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function DayProgress({ timeline, nowMin: serverNowMin, timeZone, isToday }: DayProgressProps) {
  const nowMin = useNowMinutes(serverNowMin, timeZone);
  const day = useMemo(
    () => layoutDay({ ...timeline, nowMin: isToday ? nowMin : null }),
    [timeline, isToday, nowMin],
  );

  const poKonci = isToday && nowMin >= day.dayEndMin;
  const stav = !isToday
    ? `naplánované ${formatDuration(day.plannedMin)} · voľné ${formatDuration(day.freeMin)}`
    : poKonci
      ? "deň skončil"
      : `teraz ${clock(nowMin)} · voľné ${formatDuration(day.freeMin)}`;

  return (
    <section
      aria-labelledby="dnes-priebeh"
      className="rounded-lg border border-border bg-surface px-[18px] pb-3 pt-4"
    >
      <div className="mb-2.5 flex items-baseline gap-3">
        <h2 id="dnes-priebeh" className="label text-fg-muted">
          Priebeh dňa
        </h2>
        <p className="ml-auto font-mono text-meta tabular-nums text-fg-muted">{stav}</p>
      </div>
      <DayStrip day={day} size="lg" />
    </section>
  );
}

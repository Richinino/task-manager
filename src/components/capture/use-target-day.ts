"use client";

import { useEffect, useState } from "react";

import type { DayTimeline } from "@/lib/day-timeline";
import { loadDayTimeline } from "@/server/actions/day-timeline";

const DEBOUNCE_MS = 300;

/**
 * Časová os cieľového dňa pre mini os v zachytení.
 *
 * Načítava sa s oneskorením 300 ms a výsledok sa pamätá podľa dňa, takže
 * pri písaní „zajtra" sa server nevolá po každom znaku. Offline ani chyba
 * nič nehlásia — os sa jednoducho nezobrazí.
 *
 * Pamäť sa zahadzuje pri zatvorení okna (a po uložení cez `reset`): úlohy
 * pribudli a stará os by klamala.
 */
export function useTargetDay(
  date: string | null,
  enabled: boolean,
  online: boolean,
): { day: DayTimeline | null; reset: () => void } {
  const [days, setDays] = useState<Record<string, DayTimeline>>({});
  const cached = date !== null && date in days;

  useEffect(() => {
    if (!enabled || date === null || cached || !online) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      loadDayTimeline(date)
        .then((result) => {
          if (cancelled || !result.ok) return;
          setDays((prev) => ({ ...prev, [date]: result.data }));
        })
        .catch(() => {
          /* offline alebo chyba servera: os sa nezobrazí */
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [date, enabled, cached, online]);

  useEffect(() => {
    if (!enabled) return;
    return () => setDays({});
  }, [enabled]);

  return {
    day: enabled && date !== null ? (days[date] ?? null) : null,
    reset: () => setDays({}),
  };
}

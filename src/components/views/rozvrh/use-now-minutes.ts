"use client";

import { useEffect, useState } from "react";

/**
 * Minúty od polnoci, ktoré samy bežia ďalej.
 *
 * Hodiny sa v rozvrhu odškrtávajú podľa času a nič sa pritom neukladá —
 * takže „ktorá práve beží" musí vedieť ísť ďalej aj bez prekreslenia zo
 * servera. Inak by pruh po prvom vykreslení zamrzol a o hodinu by ukazoval
 * hodinu, ktorá dávno skončila.
 *
 * **Prvá hodnota je vždy tá zo servera.** Počítať si čas v prehliadači hneď
 * pri prvom vykreslení by znamenalo, že server a klient dostanú iné číslo
 * a React ohlási nesúlad — a pri prepnutí pásma by sa hodiny rozišli s dňom,
 * ktorý sa práve zobrazuje. Vlastný čas sa preto berie až po pripojení.
 *
 * Interval je 30 sekúnd: hranica hodiny sa tým minie najviac o pol minúty,
 * čo pri 45-minútovej hodine nikto nespozná, a nie je to budíček každú
 * sekundu.
 */
export function useNowMinutes(zoServera: number, timeZone: string): number {
  const [minuty, setMinuty] = useState(zoServera);

  useEffect(() => {
    function prepocitaj(): void {
      const casti = new Intl.DateTimeFormat("sk-SK", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());

      const hod = Number(casti.find((c) => c.type === "hour")?.value ?? "0");
      const min = Number(casti.find((c) => c.type === "minute")?.value ?? "0");
      setMinuty(hod * 60 + min);
    }

    prepocitaj();
    const id = window.setInterval(prepocitaj, 30_000);
    return () => window.clearInterval(id);
  }, [timeZone]);

  return minuty;
}

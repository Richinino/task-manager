"use client";

import { useEffect, useState } from "react";

import { fullDayMin, remainingDayMin, type DayWindow } from "@/lib/day-budget";

/**
 * Koľko z dňa ešte zostáva — a mení sa to samo.
 *
 * Rozpočet dovtedy počítal celé okno z nastavení, takže o desiatej večer
 * hlásil desať voľných hodín. Toto je jediné miesto v appke, ktoré musí
 * poznať **aktuálny čas**, a preto je klientské: server pozná len okamih,
 * v ktorom stránku poslal, a o hodinu by ukazoval nezmysel.
 *
 * ## Prečo sa nezačína rovno živým číslom
 *
 * Server aj prehliadač musia pri prvom vykreslení nakresliť to isté, inak
 * React ohlási nesúlad hydratácie. Preto sa začína PLNÝM oknom — to server
 * spočítať vie — a na živé číslo sa prepne až po pripojení. Rozdiel vidno
 * jednu snímku.
 *
 * Prepočítava sa raz za minútu, a to na celú minútu: inak by sa číslo menilo
 * v náhodnej sekunde a dve otvorené karty by sa vedeli rozísť.
 */
export function useLiveDayMin(okno: DayWindow): number {
  const { dateIso, todayIso, timeZone, dayStartHour, dayEndHour } = okno;
  const [availableMin, setAvailableMin] = useState(() =>
    fullDayMin(dayStartHour, dayEndHour),
  );

  useEffect(() => {
    const aktualne: DayWindow = {
      dateIso,
      todayIso,
      timeZone,
      dayStartHour,
      dayEndHour,
    };

    function prepocitaj(): void {
      setAvailableMin(remainingDayMin(aktualne, new Date()));
    }

    prepocitaj();

    let interval: number | undefined;
    const prvy = window.setTimeout(
      () => {
        prepocitaj();
        interval = window.setInterval(prepocitaj, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );

    return () => {
      window.clearTimeout(prvy);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [dateIso, todayIso, timeZone, dayStartHour, dayEndHour]);

  return availableMin;
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { Star, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { setFrog } from "@/server/actions/tasks";

/**
 * Hviezdička priority dňa ako ovládací prvok.
 *
 * Doteraz to bola čistá dekorácia (`aria-hidden`) a kreslila sa LEN keď bola
 * priorita zapnutá. Klik by ju teda vedel nanajvýš zrušiť, nikdy nastaviť —
 * a nastavovala sa na piatich iných miestach, len nie tam, kde na ňu človek
 * pozerá.
 *
 * Teraz sa kreslí vždy: zapnutá plná a jantárová, vypnutá ako tichý obrys,
 * ktorý sa rozsvieti pri prejdení myšou. Prázdny obrys je zároveň jediný
 * spôsob, ako sa dá kliknúť na niečo, čo tam ešte nie je.
 *
 * **Len pri úlohe s naplánovaným dňom.** Priorita dňa sa viaže na deň;
 * server ju bez neho odmietne, takže ponúkať prepínač, ktorý vždy zlyhá, by
 * bolo horšie než ho neponúknuť.
 */
export interface FrogToggleProps {
  taskId: string;
  isFrog: boolean;
  title: string;
  /** Okamžité prekreslenie riadku, kým beží zápis. */
  onOptimistic: (isFrog: boolean) => void;
}

/** Čo sa ukáže namiesto hviezdičky, keď zápis zlyhá. */
const CHYBA_POPIS = "Prioritu dňa sa nepodarilo uložiť. Skús to znova.";

export function FrogToggle({ taskId, isFrog, title, onOptimistic }: FrogToggleProps) {
  const [error, setError] = useState(false);
  const [, startTransition] = useTransition();

  /*
    Hláška sama zmizne, ako všade inde v aplikácii — bez nej by hviezdička
    ostala v chybovom stave až do ďalšieho kliknutia, teda možno navždy.
  */
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(false), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  function toggle(): void {
    setError(false);
    startTransition(async () => {
      onOptimistic(!isFrog);
      try {
        const result = await setFrog(taskId, !isFrog);
        if (!result.ok) setError(true);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <button
      type="button"
      aria-pressed={isFrog}
      /*
        Zlyhanie sa NESMIE niesť len farbou — kto ju nerozozná alebo čítačku
        používa, by sa o ňom nedozvedel vôbec. Popis sa preto mení tiež
        a ikona sa vymení za výstražnú, takže signál nesie aj tvar.
      */
      aria-label={
        error
          ? `${CHYBA_POPIS} (${title})`
          : isFrog
            ? `Zrušiť prioritu dňa: ${title}`
            : `Nastaviť ako prioritu dňa: ${title}`
      }
      title={error ? CHYBA_POPIS : isFrog ? "Zrušiť prioritu dňa" : "Priorita dňa"}
      onClick={(event) => {
        // Riadok pod hviezdičkou otvára detail a v týždni začína ťah —
        // ani jedno sa nesmie spustiť pri prepínaní priority.
        event.stopPropagation();
        toggle();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className={cn(
        /*
          Dotykový cieľ je väčší než ikona: samotná hviezdička má 14 px, čo je
          pod hranicou palca. Rozšírenie ide cez neviditeľný pseudoprvok, takže
          riadok sa neroztiahne ani o pixel a odsadenia ostávajú, kde boli.
        */
        "relative flex size-[18px] shrink-0 items-center justify-center rounded-sm",
        "before:absolute before:-inset-2 before:content-[''] sm:before:hidden",
        "transition-colors duration-100 ease-out",
        isFrog
          ? "text-frog"
          : "text-fg-subtle/45 hover:text-frog focus-visible:text-frog",
        error && "text-danger",
      )}
    >
      {/* Rovnaká veľkosť ako hviezdička, takže sa riadok nepohne ani o pixel. */}
      {error ? (
        <TriangleAlert aria-hidden="true" size={14} className="shrink-0" />
      ) : (
        <Star
          aria-hidden="true"
          size={14}
          className={cn("shrink-0", isFrog && "fill-current")}
        />
      )}
    </button>
  );
}

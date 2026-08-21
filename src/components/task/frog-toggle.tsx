"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";

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

export function FrogToggle({ taskId, isFrog, title, onOptimistic }: FrogToggleProps) {
  const [error, setError] = useState(false);
  const [, startTransition] = useTransition();

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
      aria-label={
        isFrog
          ? `Zrušiť prioritu dňa: ${title}`
          : `Nastaviť ako prioritu dňa: ${title}`
      }
      title={isFrog ? "Zrušiť prioritu dňa" : "Priorita dňa"}
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
      <Star
        aria-hidden="true"
        size={14}
        className={cn("shrink-0", isFrog && "fill-current")}
      />
    </button>
  );
}

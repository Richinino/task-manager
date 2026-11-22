import type { CSSProperties } from "react";

import { areaColorValue } from "@/components/task/area-dot";

/* ═══════════════════════════════════════════════════════════════════════════
   FARBA KARTY (smer „Jedna karta" na telefóne)

   Karta úlohy je plná farebná plocha — z toho stojí živosť celého návrhu.
   Poradie, odkiaľ sa farba berie:

     1. priorita dňa      → jantárová výplň (`bg-frog-fill`), tmavý text
     2. oblasť úlohy      → farba oblasti, biely text
     3. školský predmet   → farba predmetu (tá istá paleta), biely text
     4. nič z toho        → plná čierna (v tmavej téme biela) — akcent

   Sivá plocha tu zámerne NIE JE: na prvej verzii robila z appky šedivý
   formulár a používateľ to vrátil s tým, že „chýba farebnosť".

   Bez `"use client"` — volá sa zo servera aj z klienta.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CardFillSource {
  isFrog?: boolean;
  area?: { color: string } | null;
  subject?: { color: string } | null;
}

export interface CardFill {
  /** Triedy plochy a textu. */
  className: string;
  /** Inline farba, keď ide o farbu oblasti alebo predmetu. */
  style?: CSSProperties;
  /** Podklad čipov na ploche — priesvitný, aby sadol na akúkoľvek farbu. */
  chip: string;
  /** Farba pre bodku, pásik alebo blok na osi (CSS hodnota). */
  color: string;
}

/**
 * Svetlé odtiene palety, na ktorých biely text nedosiahne čitateľný kontrast
 * (namerané na hodnotách z `areaColorValue`). Tie dostanú tmavý text.
 */
const LIGHT_FILLS = new Set(["amber", "yellow", "lime", "orange"]);

export function cardFill(source: CardFillSource): CardFill {
  if (source.isFrog) {
    return {
      className: "bg-frog-fill text-on-frog",
      chip: "bg-black/12",
      color: "var(--frog-fill)",
    };
  }
  const named = source.area?.color ?? source.subject?.color ?? null;
  if (named) {
    const color = areaColorValue(named);
    const light = LIGHT_FILLS.has(named.trim().toLowerCase());
    return {
      className: light ? "text-on-frog" : "text-white",
      style: { backgroundColor: color },
      chip: light ? "bg-black/12" : "bg-black/20",
      color,
    };
  }
  return {
    className: "bg-accent text-accent-fg",
    chip: "bg-current/15",
    color: "var(--accent)",
  };
}

import type { IdeaStageValue } from "@/lib/ideas";

/* ═══════════════════════════════════════════════════════════════════════════
   TEXTY OBRAZOVKY NÁPADOV

   Skloňovanie a pomenovanie fáz na jednom mieste. Rovnaká vec sa na obrazovke
   objaví na piatich miestach (stĺpec, karta, inkubátor, menovka pre čítačku,
   potvrdenie) a keby si to každé písalo po svojom, používateľ by si myslel,
   že ide o rôzne veci.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Slovenské skloňovanie: 1 nápad · 2–4 nápady · 0 a 5+ nápadov. */
export function ideaCountLabel(count: number): string {
  if (count === 1) return "1 nápad";
  if (count >= 2 && count <= 4) return `${count} nápady`;
  return `${count} nápadov`;
}

/** Slovenské skloňovanie: 1 deň · 2–4 dni · 0 a 5+ dní. */
export function dayCountLabel(days: number): string {
  if (days === 1) return "1 deň";
  if (days >= 2 && days <= 4) return `${days} dni`;
  return `${days} dní`;
}

/**
 * Vek na karte — koľko dlho sa nápadu nikto nedotkol.
 *
 * `staleDays` prichádza zo servera; klient si ho nikdy nepočíta sám, inak by
 * sa po polnoci v inom pásme rozišlo číslo pred hydratáciou a po nej.
 */
export function touchAgeLabel(staleDays: number): string {
  if (staleDays <= 0) return "dotknuté dnes";
  return `nedotknuté ${dayCountLabel(staleDays)}`;
}

/**
 * „pred 4 mesiacmi" — pre inkubátor, ktorý sa pýta „kedy ťa to napadlo".
 *
 * Inštrumentál sa v slovenčine podľa počtu nemení („pred 2 dňami" aj
 * „pred 7 dňami"), takže stačí vybrať jednotku a číslo doplniť tak, ako je.
 */
export function agoLabel(days: number): string {
  if (days <= 0) return "dnes";
  if (days === 1) return "včera";
  if (days < 7) return `pred ${days} dňami`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return weeks <= 1 ? "pred týždňom" : `pred ${weeks} týždňami`;
  }
  if (days < 365) {
    const months = Math.max(1, Math.round(days / 30));
    return months === 1 ? "pred mesiacom" : `pred ${months} mesiacmi`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "pred rokom" : `pred ${years} rokmi`;
}

/** Ako sa fáza volá v texte (menovky pre čítačku, potvrdenia). */
export const STAGE_LABEL: Record<IdeaStageValue, string> = {
  raw: "čerstvý",
  incubating: "zreje",
  faded: "vyblednutý",
  promoted: "povýšený na projekt",
  rejected: "zamietnutý",
};

/** Menovka iskry pre čítačku — samotné plamienky sú len obrázok. */
export function sparkLabel(spark: number): string {
  return `iskra ${spark} z 5`;
}

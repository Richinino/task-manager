/**
 * Druhy školskej práce a ich pomenovania.
 *
 * Jedno miesto pre všetky štyri. Bez neho si každá obrazovka píše vlastný
 * `schoolKind === "exam" ? "písomka" : …` a pri piatom druhu sa zabudne
 * v tej, do ktorej sa človek nepozrie — presne tak vznikol rozdiel medzi
 * mriežkou a hlavičkou pri prázdninách.
 *
 * ## Prečo sú učenie a opakovanie dva druhy
 *
 * „Naučiť sa kapitolu" a „prebehnúť si kapitolu" sú dve rôzne dĺžky večera.
 * Prvé znamená pochopiť niečo nové, druhé len prejsť, čo už viem, pre istotu.
 * Keby sa miešali, plánovanie by klamalo v oboch smeroch naraz: na učenie by
 * si nechal málo času a na opakovanie zbytočne veľa.
 */

export type SchoolKind = "homework" | "exam" | "study" | "review";

export const SCHOOL_KINDS: readonly SchoolKind[] = [
  "homework",
  "exam",
  "study",
  "review",
];

interface Popis {
  /** Do výberu v detaile úlohy. */
  label: string;
  /** Do riadku zoznamu — krátke, malým písmom. */
  short: string;
  /**
   * Má sa v riadku zvýrazniť?
   *
   * Len písomka. Ostatné tri sú bežná práca; keby svietilo všetko, prestalo
   * by svietiť čokoľvek a písomka by zapadla medzi ne.
   */
  highlight?: boolean;
}

const POPISY: Record<SchoolKind, Popis> = {
  homework: { label: "Domáca úloha", short: "domáca úloha" },
  exam: { label: "Písomka", short: "písomka", highlight: true },
  study: { label: "Učiť sa", short: "učiť sa" },
  review: { label: "Zopakovať", short: "zopakovať" },
};

export function schoolKindLabel(kind: SchoolKind): string {
  return POPISY[kind].label;
}

export function schoolKindShort(kind: SchoolKind): string {
  return POPISY[kind].short;
}

/** Má sa druh v riadku zvýrazniť? Len písomka — pozri `Popis.highlight`. */
export function schoolKindHighlighted(kind: SchoolKind): boolean {
  return POPISY[kind].highlight === true;
}

/**
 * Ukazuje sa druh v riadku zoznamu?
 *
 * Domáca úloha nie: je to najbežnejší prípad a slovo „domáca úloha" pri každej
 * školskej úlohe by bolo šumom, cez ktorý sa tie ostatné tri hľadajú ťažšie.
 * V detaile je vypísaná normálne.
 */
export function schoolKindInRow(kind: SchoolKind): boolean {
  return kind !== "homework";
}

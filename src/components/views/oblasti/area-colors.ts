/**
 * Paleta farieb oblastí.
 *
 * Farba oblasti je používateľské dáta (`areas.color`), ale nie ľubovoľný
 * hex — je to **názov** z palety, ktorú appka pozná. Prevod názvu na hodnotu
 * robí `areaColorValue` v `components/task/area-dot.tsx`; tam je jediné miesto,
 * kde sú farby naozaj zapísané, a preto sa tu iba vymenúvajú kľúče.
 *
 * Kľúč, ktorý `areaColorValue` nepozná, spadne na stlmenú neutrálnu — tento
 * zoznam preto musí ostať podmnožinou `AREA_COLORS`. Sivé odtiene (`gray`,
 * `stone`) sú vynechané zámerne: od `slate` sa v bodke veľkej 8 px nedajú
 * rozoznať a výber, v ktorom sú tri rovnaké políčka, nie je výber.
 */
export interface AreaColorOption {
  /** Kľúč, ktorý sa ukladá do `areas.color`. */
  value: string;
  /** Slovenský názov do menovky pre čítačku aj bublinu. */
  label: string;
}

export const AREA_COLOR_OPTIONS: readonly AreaColorOption[] = [
  { value: "slate", label: "bridlicová" },
  { value: "red", label: "červená" },
  { value: "orange", label: "oranžová" },
  { value: "amber", label: "jantárová" },
  { value: "yellow", label: "žltá" },
  { value: "lime", label: "limetková" },
  { value: "green", label: "zelená" },
  { value: "emerald", label: "smaragdová" },
  { value: "teal", label: "morská" },
  { value: "cyan", label: "azúrová" },
  { value: "sky", label: "nebeská" },
  { value: "blue", label: "modrá" },
  { value: "indigo", label: "indigová" },
  { value: "violet", label: "fialová" },
  { value: "purple", label: "purpurová" },
  { value: "fuchsia", label: "fuksiová" },
  { value: "pink", label: "ružová" },
  { value: "rose", label: "ružovočervená" },
] as const;

/** Predvolená farba novej oblasti — rovnaká ako `default("slate")` v schéme. */
export const DEFAULT_AREA_COLOR = "slate";

/** Názov farby po slovensky. Neznámy kľúč nesmie zhodiť riadok. */
export function areaColorLabel(value: string): string {
  const key = value.trim().toLowerCase();
  return AREA_COLOR_OPTIONS.find((option) => option.value === key)?.label ?? "vlastná";
}

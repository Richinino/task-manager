/**
 * Farby návykov.
 *
 * Paleta je zámerne **tá istá ako pri oblastiach** (`AREA_COLOR_OPTIONS`) —
 * hodnota v `habits.color` aj v `areas.color` je názov z jedného zoznamu, ktorý
 * vie `areaColorValue` preložiť na skutočný odtieň. Druhá paleta by znamenala
 * druhé miesto, kde sú farby naozaj zapísané, a tie dve by sa časom rozišli.
 *
 * Odlišné je len **poradie ponúkania**. Nový návyk nemá byť bridlicový: farba
 * je jediné, čím sa v mriežke jeden návyk odlíši od druhého, a keby prvé tri
 * návyky dostali tri sivasté odtiene, mriežky by splynuli do jednej šedej
 * plochy. Preto sa začína smaragdovou — tou istou, akú má `habits.color`
 * v schéme ako `default("emerald")`.
 */
import { AREA_COLOR_OPTIONS } from "@/components/views/oblasti/area-colors";

/** Predvolená farba nového návyku — rovnaká ako `default("emerald")` v schéme. */
export const DEFAULT_HABIT_COLOR = "emerald";

/**
 * Poradie, v akom sa farby ponúkajú novým návykom.
 *
 * Sú to výrazné, navzájom dobre rozoznateľné odtiene rozhádzané po farebnom
 * kruhu. Musí ísť o podmnožinu `AREA_COLOR_OPTIONS` — hodnota mimo palety by
 * v mriežke spadla na stlmenú neutrálnu a návyk by vyzeral ako vypnutý.
 */
const HABIT_COLOR_ORDER: readonly string[] = [
  "emerald",
  "sky",
  "violet",
  "amber",
  "rose",
  "teal",
  "indigo",
  "lime",
  "orange",
  "cyan",
  "pink",
  "blue",
];

/**
 * Prvá farba v poradí, ktorú ešte žiadny návyk nemá.
 *
 * Keď sú všetky preferované vyčerpané, siahne sa do zvyšku spoločnej palety
 * a až úplne nakoniec sa začne odznova. Opakovaná farba je menšie zlo než
 * zlyhanie zakladania.
 */
export function suggestHabitColor(used: readonly string[]): string {
  const free = HABIT_COLOR_ORDER.find((color) => !used.includes(color));
  if (free !== undefined) return free;

  const rest = AREA_COLOR_OPTIONS.find((option) => !used.includes(option.value));
  return rest?.value ?? DEFAULT_HABIT_COLOR;
}

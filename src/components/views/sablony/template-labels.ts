import { dayCountLabel } from "@/components/views/napady/idea-labels";

/* ═══════════════════════════════════════════════════════════════════════════
   TEXTY OBRAZOVKY ŠABLÓN

   Posun dňa aj počet úloh sa na obrazovke objavia na štyroch miestach naraz
   (riadok v editore, náhľad na karte, ponuka pri použití, menovka pre
   čítačku). Keby si to každé miesto písalo po svojom, používateľ by si myslel,
   že „nasledujúci deň" a „+1 deň" sú dve rôzne veci.

   Skloňovanie dní sa neopisuje — je to vlastnosť slovenčiny, nie obrazovky
   nápadov, a dve kópie tej istej vety sa skôr či neskôr rozídu. Správny domov
   by preto bol `src/lib`, kam sa v tomto kroku nesiaha; dovtedy si ho šablóny
   požičiavajú odtiaľ, kde už žije.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Slovenské skloňovanie: 1 úloha · 2–4 úlohy · 0 a 5+ úloh. */
export function taskCountLabel(count: number): string {
  if (count === 1) return "1 úloha";
  if (count >= 2 && count <= 4) return `${count} úlohy`;
  return `${count} úloh`;
}

/** To isté v akuzatíve — „Vytvoriť 1 úlohu" na tlačidle. */
export function taskCountAccusative(count: number): string {
  if (count === 1) return "1 úlohu";
  if (count >= 2 && count <= 4) return `${count} úlohy`;
  return `${count} úloh`;
}

/**
 * „vznikne 1 úloha" · „vzniknú 3 úlohy" · „vznikne 6 úloh".
 *
 * Sloveso sa v slovenčine mení s počtom, takže vetu nejde poskladať zo
 * statického „Vznikne" a čísla — pri troch úlohách by to znelo ako preklad
 * z angličtiny. Preto sa vracia celá zhoda naraz.
 */
export function tasksWillAppear(count: number): string {
  if (count >= 2 && count <= 4) return `vzniknú ${taskCountLabel(count)}`;
  return `vznikne ${taskCountLabel(count)}`;
}

/** Minulý čas toho istého: „vznikla 1 úloha" · „vznikli 3 úlohy" · „vzniklo 6 úloh". */
export function tasksAppeared(count: number): string {
  if (count === 1) return `vznikla ${taskCountLabel(count)}`;
  if (count >= 2 && count <= 4) return `vznikli ${taskCountLabel(count)}`;
  return `vzniklo ${taskCountLabel(count)}`;
}

/**
 * Plný tvar posunu — do ponuky, kde je miesto na celú vetu.
 *
 * „V deň použitia", nie „deň 0": nula je poloha v poli, nie údaj, ktorý
 * niekomu niečo povie.
 */
export function dayOffsetLabel(offset: number): string {
  if (offset <= 0) return "v deň použitia";
  if (offset === 1) return "nasledujúci deň";
  return `o ${dayCountLabel(offset)}`;
}

/** Krátky tvar do hustého riadka náhľadu. */
export function dayOffsetShort(offset: number): string {
  if (offset <= 0) return "v ten deň";
  return `+${dayCountLabel(offset)}`;
}

/**
 * Ponuka posunov v editore.
 *
 * Prvý týždeň po dňoch, potom rednúce míľniky. Rozbaľovací zoznam s 366
 * položkami by sa na telefóne nedal prejsť a rutiny sa aj tak odohrávajú
 * v prvých dňoch; posun, ktorý v ponuke nie je (napr. zo staršieho zápisu),
 * sa do nej doplní za behu.
 */
export const DAY_OFFSET_CHOICES: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 60, 90,
];

/** Ponuka odhadov v minútach — tá istá stupnica, akú má detail úlohy. */
export const ESTIMATE_CHOICES: readonly number[] = [5, 15, 30, 60, 120, 240];

/** Priorita tak, ako sa volá v detaile úlohy. Jedno pomenovanie pre celú appku. */
export const PRIORITY_CHOICES: readonly { value: number; label: string }[] = [
  { value: 1, label: "Vysoká" },
  { value: 2, label: "Stredná" },
  { value: 3, label: "Nízka" },
];

/** Energia tak, ako sa volá v detaile úlohy. */
export const ENERGY_CHOICES: readonly { value: "low" | "mid" | "high"; label: string }[] =
  [
    { value: "low", label: "Nízka" },
    { value: "mid", label: "Stredná" },
    { value: "high", label: "Vysoká" },
  ];

/**
 * Čistá logika nápadov: zhnitie (`faded`) a výber do inkubátora.
 *
 * Zámerne tu nie je nič z `src/db` ani `src/server` — funkcie berú čísla
 * a dátumy, nie riadky z databázy, aby sa dali testovať vo vitest bez
 * spojenia. Serverová vrstva si sem posiela `lastTouchedAt` a nastavenia.
 */

/** Fázy nápadu tak, ako ich vidí rozhranie — vrátane odvodenej `faded`. */
export type IdeaStageValue =
  | "raw"
  | "incubating"
  | "promoted"
  | "rejected"
  | "faded";

const MS_PER_DAY = 86_400_000;

/**
 * Koľko CELÝCH dní ubehlo od posledného dotyku.
 *
 * Nikdy nie záporné: dotyk „v budúcnosti" (posun hodín, ručne upravený seed)
 * znamená 0 dní, nie mínus. Neplatný dátum tiež vráti 0 — nápad radšej
 * vyzerá čerstvo, než by mal zmiznúť do vyblednutých.
 */
export function daysSinceTouch(lastTouchedAt: Date, now: Date = new Date()): number {
  const ms = now.getTime() - lastTouchedAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * Hranica „nedotknuté aspoň `days` dní": okamih presne `days` dní pred `now`.
 *
 * Slúži na to, aby sa dalo filtrovať priamo v SQL (`last_touched_at <= hranica`)
 * namiesto počítania dní nad každým riadkom v pamäti. Zodpovedá `daysSinceTouch`:
 * `daysSinceTouch(t, now) >= days` platí práve vtedy, keď `t <= touchThreshold(days, now)`.
 */
export function touchThreshold(days: number, now: Date = new Date()): Date {
  const safe = Number.isFinite(days) && days > 0 ? days : 0;
  return new Date(now.getTime() - safe * MS_PER_DAY);
}

/**
 * Odvodená fáza nápadu.
 *
 * Zhnitie sa do databázy NEZAPISUJE — appka nemá cron a zaviesť ho kvôli
 * jednému príznaku je neúmerné. Uložená hodnota ostáva `raw`/`incubating`,
 * len sa tak nezobrazuje. Vyblednutý nápad preto „obživne" v tej sekunde,
 * ako sa ho niekto dotkne, bez osobitnej akcie.
 *
 * Uzavreté fázy (`promoted`, `rejected`) vyblednúť nemôžu — ich osud je
 * rozhodnutý a čas s tým už nič nespraví.
 */
export function effectiveIdeaStage(
  stored: IdeaStageValue,
  staleDays: number,
  fadeAfterDays: number,
): IdeaStageValue {
  if (stored !== "raw" && stored !== "incubating") return stored;
  if (!Number.isFinite(fadeAfterDays) || fadeAfterDays <= 0) return stored;
  return staleDays >= fadeAfterDays ? "faded" : stored;
}

/**
 * Koľko dní čakania vyváži jeden stupeň iskry.
 *
 * 30 dní = jeden mesiac = predvolená hranica inkubátora. Čítať sa to dá takto:
 * „nápad s iskrou 4 predbehne nápad s iskrou 3, ktorý čaká o mesiac dlhšie".
 */
export const SPARK_DAY_VALUE = 30;

/**
 * Skóre pre výber troch nápadov do inkubátora.
 *
 *     skóre = dni bez dotyku + (iskra − 1) × 30
 *
 * Prečo súčet a nie triedenie najprv podľa iskry: absolútna prednosť iskry by
 * znamenala, že nápad s iskrou 1 sa na povrch nedostane nikdy — inkubátor by
 * donekonečna omieľal tie isté päťky a zvyšok by ticho zhnil. Takto má iskra
 * náskok 4 × 30 = 120 dní, ktorý ale čas postupne zmaže: päťka nedotknutá
 * 40 dní (160) ustúpi jednotke, ktorá čaká 170 dní (170).
 *
 * Lineárne preto, že sa to dá vysvetliť jednou vetou. Exponenciálne váhy by
 * boli presnejšie iba naoko — nemáme z čoho ich kalibrovať.
 */
export function incubatorScore(staleDays: number, spark: number): number {
  const days = Number.isFinite(staleDays) && staleDays > 0 ? staleDays : 0;
  const clamped = Number.isFinite(spark) ? Math.min(5, Math.max(1, Math.round(spark))) : 3;
  return days + (clamped - 1) * SPARK_DAY_VALUE;
}

/**
 * Porovnanie dvoch kandidátov inkubátora — vyššie skóre ide dopredu.
 *
 * Pri zhode rozhoduje dlhšie čakanie a nakoniec identifikátor, aby bolo
 * poradie stabilné: dva nápady s rovnakým skóre nesmú medzi dvoma načítaniami
 * stránky preskakovať.
 */
export function compareIncubatorCandidates(
  a: { staleDays: number; spark: number; id: string },
  b: { staleDays: number; spark: number; id: string },
): number {
  const byScore = incubatorScore(b.staleDays, b.spark) - incubatorScore(a.staleDays, a.spark);
  if (byScore !== 0) return byScore;
  const byAge = b.staleDays - a.staleDays;
  if (byAge !== 0) return byAge;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

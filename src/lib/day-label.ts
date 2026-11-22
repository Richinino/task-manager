import { diffDays } from "@/lib/dates";

/**
 * Ako sa deň volá vzhľadom na dnešok — „Dnes", „Včera", „Zajtra"…
 *
 * `null` znamená, že blízke pomenovanie nemá zmysel a stačí samotný dátum.
 * Dnešok prichádza parametrom: `formatRelativeSk` si ho počíta z pásma
 * procesu a na Verceli (UTC) by sa po polnoci rozišla so zvyškom appky.
 */
export function relativeDayLabel(date: string, todayIso: string): string | null {
  const diff = diffDays(todayIso, date);
  if (diff === 0) return "Dnes";
  if (diff === 1) return "Zajtra";
  if (diff === 2) return "Pozajtra";
  if (diff === -1) return "Včera";
  if (diff === -2) return "Predvčerom";
  return null;
}

/**
 * „na dnes", „na zajtra", „na pozajtra", inak „na tento deň" — do viet ako
 * „Na zajtra nemáš nič naplánované." Minulé dni nemajú vlastné slovo,
 * „na včera" po slovensky neznie.
 */
export function forDayPhrase(date: string, todayIso: string): string {
  const diff = diffDays(todayIso, date);
  if (diff === 0) return "na dnes";
  if (diff === 1) return "na zajtra";
  if (diff === 2) return "na pozajtra";
  return "na tento deň";
}

/** „štvrtok 6. augusta" → „Štvrtok 6. augusta" — nadpis začína veľkým. */
export function capitalizeSk(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** „Po termíne, pred 3 dňami" — pre kartu úlohy, ktorá už mala byť hotová. */
export function overdueLabel(days: number): string {
  if (days <= 0) return "Po termíne";
  if (days === 1) return "Po termíne, od včera";
  return `Po termíne, pred ${days} dňami`;
}

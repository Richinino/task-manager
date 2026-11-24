/**
 * Fokus režim — texty a výpočty pre rozhranie.
 *
 * Čisté funkcie bez Reactu a bez DB, aby sa dali testovať. Čas sa ukazuje
 * v celých minútach: sekundy by z fokusu robili stopky a človeka by tlačili
 * do pozerania na čas namiesto práce (PLAN.md §6.7).
 */

import { remainingMinutes } from "@/lib/focus";

const MS_PER_MIN = 60_000;

/** Veta po vypršaní odhadu — jedno znenie pre obrazovku aj lištu. */
export const TIME_UP_PROMPT = "Odhad vypršal. Ešte 15 minút, hotovo, alebo rozdeliť?";

/**
 * „zostáva 18 min" / „odhad práve vypršal" / „o 7 min dlhšie než odhad".
 *
 * `remaining` je výsledok `remainingMinutes`: kladné = zostáva, 0 = vypršalo
 * práve teraz, záporné = o toľko minút po termíne.
 */
export function remainingLabel(remaining: number): string {
  if (remaining > 0) return `zostáva ${remaining} min`;
  if (remaining === 0) return "odhad práve vypršal";
  return `o ${-remaining} min dlhšie než odhad`;
}

/** Lišta „Teraz robíš: <názov> · zostáva 12 min". */
export function nowBarLabel(title: string, remaining: number): string {
  return `Teraz robíš: ${title} · ${remainingLabel(remaining)}`;
}

/**
 * Podiel uplynulého času z naplánovaného úseku, 0 až 1.
 * Po vypršaní ostáva na 1 — tenký pásik nemá pretiecť.
 */
export function focusProgress(startedAtMs: number, plannedEndAtMs: number, nowMs: number): number {
  const total = plannedEndAtMs - startedAtMs;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (nowMs - startedAtMs) / total));
}

/**
 * Odpracované minúty „teraz": hodnota zo servera plus celé minúty od chvíle,
 * keď prišla. Server počíta po okamih odpovede, takže stačí pripočítať rozdiel.
 */
export function liveSpentMinutes(spentAtLoad: number, loadedAtMs: number, nowMs: number): number {
  return spentAtLoad + Math.max(0, Math.floor((nowMs - loadedAtMs) / MS_PER_MIN));
}

/** „Odpracované: 35 min z odhadu 30 min" — bez odhadu len „Odpracované: 35 min". */
export function spentLine(spentMin: number, estimateMin: number | null): string {
  return estimateMin === null
    ? `Odpracované: ${spentMin} min`
    : `Odpracované: ${spentMin} min z odhadu ${estimateMin} min`;
}

/** Minúty do `plannedEndAt` z ISO reťazca — tenký obal, aby volajúci nepísal `new Date`. */
export function remainingFromIso(plannedEndAtIso: string, nowMs: number): number {
  return remainingMinutes(new Date(plannedEndAtIso), new Date(nowMs));
}

/**
 * Čas najbližšieho prekreslenia v ms od epochy.
 *
 * Tikáme v rytme `plannedEndAt`, nie celých minút na hodinách: vtedy sa
 * „zostáva N min" zmení presne vtedy, keď sa N zmenilo, a vypršanie príde
 * v okamihu `plannedEndAt`, nie až o desiatky sekúnd neskôr. Nikdy nie častejšie
 * než raz za minútu.
 */
export function nextTickAt(plannedEndAtMs: number, nowMs: number): number {
  const diff = plannedEndAtMs - nowMs;
  if (diff > 0) {
    const rest = diff % MS_PER_MIN;
    return nowMs + (rest === 0 ? MS_PER_MIN : rest);
  }
  // Po termíne: ďalší násobok minúty od `plannedEndAt`.
  const over = nowMs - plannedEndAtMs;
  return plannedEndAtMs + (Math.floor(over / MS_PER_MIN) + 1) * MS_PER_MIN;
}

export interface LocalNotificationCheck {
  /** `Notification.permission`, alebo `null` keď prehliadač API nemá. */
  permission: NotificationPermission | null;
  visibility: DocumentVisibilityState;
  /** `plannedEndAt`, pre ktoré sa už rozhodlo (oznámilo, alebo bolo okno vidno). */
  handledFor: string | null;
  plannedEndAt: string;
}

/** Lokálne oznámenie len raz na `plannedEndAt` a len keď je okno skryté. */
export function shouldNotifyLocally(check: LocalNotificationCheck): boolean {
  if (check.handledFor === check.plannedEndAt) return false;
  return check.permission === "granted" && check.visibility === "hidden";
}

export function timeUpNotification(
  title: string,
  taskId: string,
): { title: string; options: NotificationOptions & { actions: { action: string; title: string }[] } } {
  return {
    title: "Odhad vypršal",
    options: {
      body: `${title} — ešte 15 minút, hotovo, alebo rozdeliť?`,
      tag: `focus-${taskId}`,
      data: { url: "/dnes?fokus=1", taskId },
      actions: [
        { action: "fokus-plus", title: "+15 min" },
        { action: "fokus-hotovo", title: "Hotovo" },
      ],
    },
  };
}

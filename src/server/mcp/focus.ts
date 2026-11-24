import { isFocusOver, remainingMinutes } from "@/lib/focus";

/*
  Fokus pre MCP — čistý tvar dát a veta o tom, čo človek práve robí.

  Oddelené od `format.ts` (ten importuje `server-only`), aby sa dalo testovať
  bez databázy. Čísla počíta `@/lib/focus`, rovnako ako obrazovka fokusu —
  Claude tak povie presne to, čo vidí človek na lište.
*/

/** Čo z bežiaceho fokusu treba: úloha už načítaná, časy ako ISO. */
export interface FocusSource {
  taskId: string;
  plannedEndAt: string;
  spentMin: number;
  task: { title: string };
}

export interface McpFocus {
  taskId: string;
  title: string;
  /** Do kedy sa to plánovalo (ISO). */
  plannedEndAt: string;
  /** Odpracované celé minúty cez všetky úseky tejto úlohy. */
  spentMin: number;
  /** Zostáva minút; po termíne 0 (koľko je navyše, je v `overByMin`). */
  remainingMin: number;
  over: boolean;
  /** Koľko minút po termíne; 0, kým čas neprešiel. */
  overByMin: number;
  /** Hotová veta pre človeka. */
  summary: string;
}

/**
 * Veta „Teraz robíš: …". Po termíne sa nehovorí „zostáva −3", ale to, čo sa
 * naozaj deje: že to trvá dlhšie, než sa plánovalo.
 */
export function focusSummary(title: string, remainingMin: number, spentMin: number): string {
  const spent = `odpracované ${spentMin} min`;
  return remainingMin >= 0
    ? `Teraz robíš: ${title} · zostáva ${remainingMin} min / ${spent}`
    : `Teraz robíš: ${title} · o ${-remainingMin} min dlhšie, než si plánoval / ${spent}`;
}

export function mcpFocus(active: FocusSource, now: Date): McpFocus {
  const plannedEnd = new Date(active.plannedEndAt);
  const signed = remainingMinutes(plannedEnd, now);
  const over = isFocusOver(plannedEnd, now);
  return {
    taskId: active.taskId,
    title: active.task.title,
    plannedEndAt: active.plannedEndAt,
    spentMin: active.spentMin,
    remainingMin: Math.max(0, signed),
    over,
    overByMin: over ? Math.max(0, -signed) : 0,
    summary: focusSummary(active.task.title, signed, active.spentMin),
  };
}

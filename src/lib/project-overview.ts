import { diffDays, formatDayMonthSk } from "./dates";
import { pluralSk } from "./sk";

/* ═══════════════════════════════════════════════════════════════════════════
   PREHĽAD PROJEKTU NA TELEFÓNE

   Čistá logika bez Reactu: ktorá úloha je „ďalší krok", čo je naplánované,
   čo je bez dátumu a čo hotové; a text o termíne projektu.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface OverviewTask {
  id: string;
  status: string;
  isFrog: boolean;
  dueDate: string | null;
}

export interface ProjectBuckets<T extends OverviewTask> {
  next: T | null;
  scheduled: T[];
  undated: T[];
  done: T[];
}

/**
 * Ďalší krok: priorita dňa, inak úloha s najbližším dátumom, inak prvá
 * v poradí. Zvyšok sa delí na naplánované (s dátumom) a bez dátumu.
 */
export function bucketProjectTasks<T extends OverviewTask>(tasks: T[]): ProjectBuckets<T> {
  const open = tasks.filter((t) => t.status !== "done" && t.status !== "dropped");
  const done = tasks.filter((t) => t.status === "done" || t.status === "dropped");

  const dated = open
    .filter((t) => t.dueDate !== null)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0));

  const next = open.find((t) => t.isFrog) ?? dated[0] ?? open[0] ?? null;

  return {
    next,
    scheduled: dated.filter((t) => t !== next),
    undated: open.filter((t) => t.dueDate === null && t !== next),
    done,
  };
}

/** „termín 15. 12., o 23 dní" · „termín 15. 12., dnes" · „termín 15. 12., 3 dni po termíne". */
export function projectDeadlineLabel(deadline: string, todayIso: string): string {
  const diff = diffDays(todayIso, deadline);
  const date = formatDayMonthSk(deadline);
  if (diff === 0) return `termín ${date}, dnes`;
  if (diff === 1) return `termín ${date}, zajtra`;
  if (diff > 1) return `termín ${date}, o ${diff} ${pluralSk(diff, "deň", "dni", "dní")}`;
  const late = Math.abs(diff);
  return `termín ${date}, ${late} ${pluralSk(late, "deň", "dni", "dní")} po termíne`;
}

/** „4 z 9 hotové" — tvar je stály. */
export function projectProgressLabel(done: number, total: number): string {
  return total === 0 ? "zatiaľ bez úloh" : `${done} z ${total} hotové`;
}

/** Podiel hotových úloh, 0 až 100. */
export function projectProgressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

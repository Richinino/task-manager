/**
 * Rozloženie dňa na časovú os.
 *
 * Čistá funkcia: žiadne `Date.now`, žiadna databáza. „Teraz" aj okno dňa
 * prichádzajú zvonku, všetky časy sú v minútach od miestnej polnoci.
 *
 * Fakty (hodiny, porady, udalosti) sa nikdy neposúvajú ani nerušia — aj keď
 * sa prekrývajú, ostanú tak, ako sú. Úlohy sa okolo nich len poukladajú do
 * voľných miest. Žiadna úloha sa nedelí na kúsky: buď sa zmestí celá, alebo
 * ostane nezaradená.
 */

export type BusyKind = "lesson" | "meeting" | "event";

export interface TimelineBusy {
  id: string;
  kind: BusyKind;
  label: string;
  startMin: number;
  endMin: number;
}

export interface TimelineTask {
  id: string;
  title: string;
  estimateMin: number | null;
  /** Pevný začiatok (minúty od polnoci), ak má úloha naplánovaný čas. */
  fixedStartMin: number | null;
  isFrog: boolean;
  areaColor: string | null;
  done: boolean;
}

export interface TimelineInput {
  dayStartMin: number;
  dayEndMin: number;
  /** `null`, keď nejde o dnešok — nič nie je minulé a nič sa neposúva. */
  nowMin: number | null;
  busy: readonly TimelineBusy[];
  tasks: readonly TimelineTask[];
}

export interface TimelineBlock {
  kind: BusyKind | "task";
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  past: boolean;
  isFrog?: boolean;
  areaColor?: string | null;
}

export interface TimelineGap {
  startMin: number;
  endMin: number;
}

export interface DayTimeline {
  dayStartMin: number;
  dayEndMin: number;
  nowMin: number | null;
  blocks: TimelineBlock[];
  unplaced: TimelineTask[];
  gaps: TimelineGap[];
  freeMin: number;
  plannedMin: number;
}

/** Úloha bez odhadu, ale s pevným časom, zaberie toto. */
const DEFAULT_FIXED_MIN = 30;
/** Voľné miesto kratšie než toto sa do `gaps` nepočíta. */
const MIN_GAP_MIN = 5;

const KIND_ORDER: Record<TimelineBlock["kind"], number> = {
  lesson: 0,
  meeting: 1,
  event: 2,
  task: 3,
};

interface Interval {
  startMin: number;
  endMin: number;
}

/** Voľné intervaly v `[from, to]` po odpočítaní obsadených (v ľubovoľnom poradí). */
function freeIntervals(occupied: readonly Interval[], from: number, to: number): Interval[] {
  const sorted = [...occupied].sort((a, b) => a.startMin - b.startMin);
  const out: Interval[] = [];
  let cursor = from;
  for (const item of sorted) {
    if (item.endMin <= cursor) continue;
    if (item.startMin >= to) break;
    if (item.startMin > cursor) out.push({ startMin: cursor, endMin: item.startMin });
    cursor = Math.max(cursor, item.endMin);
  }
  if (cursor < to) out.push({ startMin: cursor, endMin: to });
  return out;
}

export function layoutDay(input: TimelineInput): DayTimeline {
  const { dayStartMin, dayEndMin, nowMin } = input;
  const isPast = (endMin: number): boolean => nowMin !== null && endMin <= nowMin;

  const blocks: TimelineBlock[] = [];
  const occupied: Interval[] = [];
  const unplaced: TimelineTask[] = [];
  let plannedMin = 0;

  // Fakty: orezať na okno dňa, prázdne zahodiť.
  for (const item of input.busy) {
    const startMin = Math.max(item.startMin, dayStartMin);
    const endMin = Math.min(item.endMin, dayEndMin);
    if (endMin <= startMin) continue;
    blocks.push({
      kind: item.kind,
      id: item.id,
      label: item.label,
      startMin,
      endMin,
      past: isPast(endMin),
    });
    occupied.push({ startMin, endMin });
  }

  const place = (task: TimelineTask, startMin: number, endMin: number): void => {
    const block: TimelineBlock = {
      kind: "task",
      id: task.id,
      label: task.title,
      startMin,
      endMin,
      past: isPast(endMin),
      areaColor: task.areaColor,
    };
    if (task.isFrog) block.isFrog = true;
    blocks.push(block);
    occupied.push({ startMin, endMin });
    plannedMin += endMin - startMin;
  };

  const open = input.tasks.filter((task) => !task.done);

  // Úlohy s pevným časom stoja, kde ich človek dal — aj cez fakty.
  const flexible: TimelineTask[] = [];
  for (const task of open) {
    if (task.fixedStartMin === null) {
      flexible.push(task);
      continue;
    }
    const startMin = Math.max(task.fixedStartMin, dayStartMin);
    const endMin = Math.min(
      task.fixedStartMin + (task.estimateMin ?? DEFAULT_FIXED_MIN),
      dayEndMin,
    );
    if (endMin <= startMin) unplaced.push(task);
    else place(task, startMin, endMin);
  }

  // Najprv priorita dňa, potom ostatné v poradí zadania.
  const ordered = [
    ...flexible.filter((task) => task.isFrog),
    ...flexible.filter((task) => !task.isFrog),
  ];
  const cursor = Math.max(dayStartMin, nowMin ?? dayStartMin);

  for (const task of ordered) {
    const duration = task.estimateMin;
    if (duration === null || duration <= 0) {
      unplaced.push(task);
      continue;
    }
    const gap = freeIntervals(occupied, cursor, dayEndMin).find(
      (g) => g.endMin - g.startMin >= duration,
    );
    if (gap === undefined) unplaced.push(task);
    else place(task, gap.startMin, gap.startMin + duration);
  }

  const gaps = freeIntervals(occupied, cursor, dayEndMin).filter(
    (g) => g.endMin - g.startMin >= MIN_GAP_MIN,
  );
  const freeMin = gaps.reduce((sum, g) => sum + (g.endMin - g.startMin), 0);

  blocks.sort(
    (a, b) =>
      a.startMin - b.startMin ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.id.localeCompare(b.id),
  );

  return { dayStartMin, dayEndMin, nowMin, blocks, unplaced, gaps, freeMin, plannedMin };
}

/**
 * Najskoršie voľné miesto na `durationMin` minút, orezané presne na túto
 * dĺžku. `null`, keď sa nezmestí nikam.
 */
export function findSlot(day: DayTimeline, durationMin: number): TimelineGap | null {
  if (!(durationMin > 0)) return null;
  const gap = day.gaps.find((g) => g.endMin - g.startMin >= durationMin);
  if (gap === undefined) return null;
  return { startMin: gap.startMin, endMin: gap.startMin + durationMin };
}

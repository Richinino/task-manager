import { formatDuration, timeToMinutes } from "@/lib/dates";

/**
 * Text „teraz" pilulky na obrazovke Dnes: čo práve beží alebo čo príde ako
 * najbližšie. Čistá funkcia — čas aj dáta prichádzajú zvonku.
 */

export interface NowLabelLesson {
  /** `HH:MM` */
  startTime: string;
  endTime: string;
  subjectCode: string;
  room: string | null;
  cancelled: boolean;
}

export interface NowLabelEvent {
  title: string;
  /** Minúty od polnoci. */
  startMin: number;
  endMin: number;
}

export interface NowLabelInput {
  lessons: readonly NowLabelLesson[];
  events: readonly NowLabelEvent[];
  nowMin: number;
}

interface Slot {
  startMin: number;
  endMin: number;
  what: string;
}

function clock(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

function lessonSlots(lessons: readonly NowLabelLesson[]): Slot[] {
  const out: Slot[] = [];
  for (const lesson of lessons) {
    if (lesson.cancelled) continue;
    const startMin = timeToMinutes(lesson.startTime.slice(0, 5));
    const endMin = timeToMinutes(lesson.endTime.slice(0, 5));
    if (startMin === null || endMin === null || endMin <= startMin) continue;
    const room = lesson.room?.trim();
    out.push({
      startMin,
      endMin,
      what: room ? `${lesson.subjectCode} v ${room}` : lesson.subjectCode,
    });
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

export function nowLabel({ lessons, events, nowMin }: NowLabelInput): string | null {
  const school = lessonSlots(lessons);
  const timed: Slot[] = events
    .filter((e) => e.endMin > e.startMin)
    .map((e) => ({ startMin: e.startMin, endMin: e.endMin, what: e.title }))
    .sort((a, b) => a.startMin - b.startMin);

  const runningLesson = school.find((s) => s.startMin <= nowMin && nowMin < s.endMin);
  if (runningLesson) return `Teraz ${runningLesson.what}, do ${clock(runningLesson.endMin)}`;

  const runningEvent = timed.find((s) => s.startMin <= nowMin && nowMin < s.endMin);
  if (runningEvent) return `Teraz ${runningEvent.what}, do ${clock(runningEvent.endMin)}`;

  const nextLesson = school.find((s) => s.startMin > nowMin);
  if (nextLesson) {
    const wait = formatDuration(nextLesson.startMin - nowMin);
    const inBreak = school.some((s) => s.endMin <= nowMin);
    return inBreak ? `Prestávka, o ${wait} ${nextLesson.what}` : `O ${wait} ${nextLesson.what}`;
  }

  const nextEvent = timed.find((s) => s.startMin > nowMin);
  if (nextEvent) return `O ${clock(nextEvent.startMin)} ${nextEvent.what}`;

  return null;
}

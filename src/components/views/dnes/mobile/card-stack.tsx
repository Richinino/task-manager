"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Play, SkipForward, Star } from "lucide-react";

import { useCapture } from "@/components/capture/capture-provider";
import { cardFill } from "@/components/task/card-fill";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import { formatDuration } from "@/lib/dates";
import { capitalizeSk, overdueLabel } from "@/lib/day-label";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   BALÍK KARIET

   Jedna veľká karta naraz: priorita dňa, potom čo je po termíne, potom
   ostatné. Dve ďalšie kukajú spoza nej. Karta sa dá potiahnuť — doľava
   „Ďalšia", doprava „Hotovo" — a všetko to isté zvládnu aj tlačidlá, takže
   klávesnica ani čítačka gesto nepotrebujú.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface QueueCard {
  task: TaskWithRelations;
  /** Dni po termíne, alebo `null`, keď karta nie je prepadnutá. */
  overdueDays: number | null;
  /** Poloha v neposunutom poradí (od 1) — „2 z 6". */
  position: number;
}

export interface CardStackProps {
  cards: readonly QueueCard[];
  /** Koľko kariet bolo v balíku na začiatku (do „N z M"). */
  total: number;
  /** Na dnes je niečo hotové, ale už nič nezostalo. */
  allDone: boolean;
  date: string;
  /** „na dnes", „na zajtra"… z `forDayPhrase`. */
  forDay: string;
  error: string | null;
  onDone: (task: TaskWithRelations) => void;
  onSkip: (task: TaskWithRelations) => void;
}

/** Vzdialenosť potiahnutia, od ktorej gesto platí. */
const SWIPE_PX = 90;
const EXIT_MS = 160;

interface Look {
  className: string;
  style?: CSSProperties;
  chip: string;
}

function lookOf(card: QueueCard): Look {
  const { task } = card;
  if (card.overdueDays !== null) {
    return {
      className: "border-[1.5px] border-danger bg-surface text-fg",
      chip: "bg-surface-2",
    };
  }
  // Plná farba vždy: priorita dňa, oblasť, predmet, inak čierna — nikdy sivá.
  const fill = cardFill(task);
  return { className: fill.className, style: fill.style, chip: fill.chip };
}

function labelOf(card: QueueCard, forDay: string): string {
  if (card.overdueDays !== null) return overdueLabel(card.overdueDays);
  if (card.task.isFrog) return "Priorita dňa";
  return card.task.area?.name ?? capitalizeSk(forDay);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex h-[30px] max-w-full items-center rounded-full px-3 text-body font-medium",
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function TopCard({
  card,
  total,
  forDay,
  canSkip,
  onDone,
  onSkip,
}: {
  card: QueueCard;
  total: number;
  forDay: string;
  canSkip: boolean;
  onDone: () => void;
  onSkip: () => void;
}) {
  const { task } = card;
  const detail = useTaskDetail();
  const look = lookOf(card);

  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exit, setExit] = useState<"left" | "right" | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function commit(dir: "left" | "right") {
    if (exit !== null) return;
    if (dir === "left" && !canSkip) {
      setDx(0);
      return;
    }
    const run = dir === "left" ? onSkip : onDone;
    if (prefersReducedMotion()) {
      run();
      return;
    }
    setExit(dir);
    timer.current = window.setTimeout(run, EXIT_MS);
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (exit !== null) return;
    // Tlačidlá v karte si klik riešia samy.
    if ((event.target as HTMLElement).closest("button, a")) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const s = start.current;
    if (!s || s.id !== event.pointerId) return;
    const moveX = event.clientX - s.x;
    const moveY = event.clientY - s.y;
    if (!dragging) {
      // Zvislé ťahanie je rolovanie stránky, nie gesto.
      if (Math.abs(moveY) > Math.abs(moveX) && Math.abs(moveY) > 8) {
        start.current = null;
        return;
      }
      if (Math.abs(moveX) < 6) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    setDx(moveX);
  }

  function finish(event: React.PointerEvent<HTMLElement>, cancelled: boolean) {
    const s = start.current;
    if (!s || s.id !== event.pointerId) return;
    start.current = null;
    setDragging(false);
    if (!cancelled && dx <= -SWIPE_PX) commit("left");
    else if (!cancelled && dx >= SWIPE_PX) commit("right");
    else setDx(0);
  }

  const offset = exit === "left" ? -140 : exit === "right" ? 140 : null;
  const transform =
    offset !== null
      ? `translateX(${offset}%) rotate(${offset / 14}deg)`
      : dx !== 0
        ? `translateX(${dx}px) rotate(${dx / 24}deg)`
        : undefined;

  return (
    <article
      aria-label={`${labelOf(card, forDay)}: ${task.title}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      style={{ ...look.style, transform, touchAction: "pan-y" }}
      className={cn(
        "absolute inset-x-0 top-0 z-10 flex h-[300px] select-none flex-col rounded-[22px] p-5",
        !dragging && "transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none",
        offset !== null && "opacity-0",
        look.className,
      )}
    >
      <div
        className={cn(
          "flex h-[18px] items-center justify-between gap-3 text-body font-semibold",
          card.overdueDays !== null && "text-danger",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {task.isFrog && card.overdueDays === null ? (
            <Star aria-hidden="true" className="size-4 shrink-0 fill-current" />
          ) : null}
          <span className="truncate">{labelOf(card, forDay)}</span>
        </span>
        <span className="shrink-0 font-mono tabular-nums">
          {card.position} z {total}
        </span>
      </div>

      <h2 className="mt-3.5 line-clamp-3 break-words font-display text-hero leading-[1.05] tracking-tight">
        {task.title}
      </h2>

      <div className="mt-3.5 flex flex-wrap gap-2">
        {task.project ? <Chip className={look.chip}>{task.project.name}</Chip> : null}
        {task.estimateMin !== null ? (
          <Chip className={look.chip}>{formatDuration(task.estimateMin)}</Chip>
        ) : null}
        {task.subject ? <Chip className={look.chip}>{task.subject.code}</Chip> : null}
      </div>

      <div className="mt-auto flex gap-2.5">
        {detail ? (
          <button
            type="button"
            onClick={() => detail.open(task)}
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-accent text-row font-semibold text-accent-fg"
          >
            <Play aria-hidden="true" className="size-[18px] fill-current" />
            Začať
          </button>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={() => commit("right")}
          aria-label={`Hotovo: ${task.title}`}
          className="flex size-[52px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-current/30"
        >
          <Check aria-hidden="true" className="size-[22px]" />
        </button>
        <button
          type="button"
          onClick={() => commit("left")}
          disabled={!canSkip}
          aria-label="Ďalšia úloha"
          className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-current/30 disabled:opacity-40"
        >
          <SkipForward aria-hidden="true" className="size-[22px]" />
        </button>
      </div>
    </article>
  );
}

function PeekCard({ card, depth }: { card: QueueCard; depth: 1 | 2 }) {
  const look = lookOf(card);
  return (
    <div
      aria-hidden="true"
      style={look.style}
      className={cn(
        "absolute h-[300px] rounded-[22px]",
        depth === 1 ? "inset-x-3 top-2" : "inset-x-6 top-4",
        look.className,
        depth === 2 && "opacity-70",
      )}
    />
  );
}

function CalmCard({ title, date, empty }: { title: string; date: string; empty: boolean }) {
  const { openCapture } = useCapture();
  return (
    <div className="flex h-[300px] flex-col justify-between rounded-[22px] bg-surface-2 p-5">
      <h2 className="font-display text-hero leading-[1.05] tracking-tight">{title}</h2>
      {empty ? (
        <button
          type="button"
          onClick={() => openCapture({ defaultDate: date })}
          className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-row font-semibold text-accent-fg"
        >
          Zachytiť úlohu
        </button>
      ) : null}
    </div>
  );
}

export function CardStack({
  cards,
  total,
  allDone,
  date,
  forDay,
  error,
  onDone,
  onSkip,
}: CardStackProps) {
  const top = cards[0];

  return (
    <section aria-label="Úlohy na dnes" className="px-5">
      {top ? (
        <div className="relative h-[316px]">
          {cards[2] ? <PeekCard card={cards[2]} depth={2} /> : null}
          {cards[1] ? <PeekCard card={cards[1]} depth={1} /> : null}
          <TopCard
            key={top.task.id}
            card={top}
            total={total}
            forDay={forDay}
            canSkip={cards.length > 1}
            onDone={() => onDone(top.task)}
            onSkip={() => onSkip(top.task)}
          />
        </div>
      ) : allDone ? (
        <CalmCard title={`Všetko ${forDay} je hotové.`} date={date} empty={false} />
      ) : (
        <CalmCard title={`${capitalizeSk(forDay)} nemáš nič naplánované.`} date={date} empty />
      )}

      {error ? (
        <p role="status" className="mt-2 text-meta font-medium text-danger">
          {error}
        </p>
      ) : cards.length > 1 ? (
        <p className="mt-2 text-center text-meta text-fg-subtle">
          Potiahni doľava pre ďalšiu úlohu
        </p>
      ) : null}
    </section>
  );
}

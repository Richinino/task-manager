"use client";

import { useEffect, useRef } from "react";

import { areaColorValue } from "@/components/task/area-dot";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import { formatDuration } from "@/lib/dates";
import type { DayTimeline, TimelineBlock } from "@/lib/day-timeline";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   CELÝ DEŇ NA SVISLEJ OSI

   Pohľad „Deň" na telefóne — prepína sa navrchu obrazovky Dnes alebo
   ťuknutím na pravítko pod kartou. Je to časť stránky, nie okno: dá sa
   z neho rovno odškrtávať a lišta ostáva pod palcom. Škola je sivá, porady a udalosti sú
   obrys, úlohy nesú farbu oblasti a priorita dňa jantár. Úlohy bez miesta
   (nezmestili sa alebo nemajú odhad) čakajú v zásobníku pod osou.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Výška jednej minúty v pixeloch. */
const PX_PER_MIN = 0.8;
/** Najmenšia výška bloku, aby sa na krátky dal ešte ťuknúť. */
const MIN_BLOCK_PX = 24;

export interface DayAxisViewProps {
  day: DayTimeline;
  /** Otvorené úlohy dňa podľa id — z nich sa otvára detail. */
  tasks: ReadonlyMap<string, TaskWithRelations>;
}

function clock(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

interface Placed {
  block: TimelineBlock;
  lane: number;
  lanes: number;
}

/** Prekrývajúce sa bloky vedľa seba, nie jeden na druhom. */
function placeLanes(blocks: readonly TimelineBlock[]): Placed[] {
  const out: Placed[] = [];
  let cluster: { block: TimelineBlock; lane: number }[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const item of cluster) out.push({ ...item, lanes });
    cluster = [];
    laneEnds.length = 0;
    clusterEnd = -1;
  };

  for (const block of blocks) {
    if (cluster.length > 0 && block.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.endMin);
    } else {
      laneEnds[lane] = block.endMin;
    }
    cluster.push({ block, lane });
    clusterEnd = Math.max(clusterEnd, block.endMin);
  }
  flush();
  return out;
}

function blockLook(block: TimelineBlock): { className: string; style?: { backgroundColor: string } } {
  if (block.kind === "lesson") return { className: "bg-border-strong text-fg" };
  if (block.kind === "meeting" || block.kind === "event") {
    return { className: "border-2 border-fg bg-surface text-fg" };
  }
  if (block.isFrog) return { className: "bg-frog-fill text-on-frog" };
  if (block.areaColor) {
    return { className: "text-white", style: { backgroundColor: areaColorValue(block.areaColor) } };
  }
  return { className: "bg-accent text-accent-fg" };
}

function Axis({ day, tasks, onPick }: { day: DayTimeline; tasks: ReadonlyMap<string, TaskWithRelations>; onPick: (task: TaskWithRelations) => void }) {
  const nowLine = useRef<HTMLDivElement>(null);
  const span = day.dayEndMin - day.dayStartMin;
  const height = span * PX_PER_MIN;
  const top = (min: number) => (Math.min(Math.max(min, day.dayStartMin), day.dayEndMin) - day.dayStartMin) * PX_PER_MIN;

  // Pri prepnutí na Deň sa stránka posunie tak, aby bolo „teraz" na očiach.
  useEffect(() => {
    nowLine.current?.scrollIntoView({ block: "center" });
    // Len pri zobrazení — živé „teraz" nemá posúvať to, čo si človek prezerá.
  }, []);

  const hours: number[] = [];
  for (let h = Math.ceil(day.dayStartMin / 60); h <= Math.floor(day.dayEndMin / 60); h += 1) hours.push(h);

  const placed = placeLanes(day.blocks);
  const showNow = day.nowMin !== null && day.nowMin > day.dayStartMin && day.nowMin < day.dayEndMin;

  return (
    <div>
      <div className="relative mx-4 my-4" style={{ height }}>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute inset-x-0 border-t border-border"
            style={{ top: top(h * 60) }}
          >
            <span className="absolute -top-2 left-0 w-9 bg-bg pr-1 font-mono text-micro tabular-nums text-fg-subtle">
              {h}:00
            </span>
          </div>
        ))}

        <div className="absolute inset-y-0 left-11 right-0">
          {placed.map(({ block, lane, lanes }) => {
            const look = blockLook(block);
            const heightPx = Math.max((block.endMin - block.startMin) * PX_PER_MIN, MIN_BLOCK_PX);
            const task = block.kind === "task" ? tasks.get(block.id) : undefined;
            const style = {
              top: top(block.startMin),
              height: heightPx,
              left: `${(lane / lanes) * 100}%`,
              width: `calc(${100 / lanes}% - 2px)`,
              ...look.style,
            };
            const className = cn(
              "absolute flex flex-col overflow-hidden rounded-lg px-2 py-1 text-left",
              look.className,
              block.past && "opacity-50",
            );
            const content = (
              <>
                <span className="truncate text-meta font-semibold">{block.label}</span>
                {heightPx >= 40 ? (
                  <span className="truncate font-mono text-micro tabular-nums opacity-80">
                    {clock(block.startMin)}–{clock(block.endMin)}
                  </span>
                ) : null}
              </>
            );
            return task ? (
              <button
                key={`${block.kind}-${block.id}`}
                type="button"
                style={style}
                className={className}
                onClick={() => onPick(task)}
                aria-label={`${block.label}, ${clock(block.startMin)} až ${clock(block.endMin)}. Otvoriť detail.`}
              >
                {content}
              </button>
            ) : (
              <div key={`${block.kind}-${block.id}`} style={style} className={className}>
                {content}
              </div>
            );
          })}
        </div>

        {showNow && day.nowMin !== null ? (
          <div
            ref={nowLine}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger"
            style={{ top: top(day.nowMin) }}
          >
            <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-danger" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DayAxisView({ day, tasks }: DayAxisViewProps) {
  const detail = useTaskDetail();

  function pick(task: TaskWithRelations) {
    detail?.open(task);
  }

  return (
    <section aria-label="Celý deň na osi">
      <Axis day={day} tasks={tasks} onPick={pick} />

      <div className="mx-5 border-t border-border pt-3">
        <h2 className="text-body font-semibold text-fg-muted">Bez času</h2>
        {day.unplaced.length === 0 ? (
          <p className="mt-1 text-body text-fg-subtle">Každá úloha má svoje miesto.</p>
        ) : (
          <>
            <p className="mt-1 text-meta text-fg-subtle">
              Nemajú odhad alebo sa do dňa nezmestili. Ťuknutím doplníš odhad alebo čas.
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {day.unplaced.map((item) => {
                const task = tasks.get(item.id);
                return (
                  <li key={item.id} className="max-w-full">
                    <button
                      type="button"
                      disabled={!task}
                      onClick={() => task && pick(task)}
                      className="flex h-11 max-w-full items-center gap-2 rounded-full bg-surface-2 px-4 text-body font-medium"
                    >
                      <span className="truncate">{item.title}</span>
                      {item.estimateMin !== null ? (
                        <span className="shrink-0 text-fg-muted">{formatDuration(item.estimateMin)}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

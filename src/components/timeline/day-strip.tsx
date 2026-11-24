import type { CSSProperties } from "react";

import { areaColorValue } from "@/components/task/area-dot";
import { formatDuration } from "@/lib/dates";
import type { DayTimeline, TimelineBlock, TimelineGap } from "@/lib/day-timeline";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   PRAVÍTKO DŇA

   Vodorovný pás celého dňa: škola, porady a udalosti, úlohy položené do
   voľných medzier a čiara „teraz". Používa ho Dnes (pod kopou kariet)
   aj zachytenie (zajtrajšok s miestom, kam sa nová úloha zmestí).

   Zámerne bez `"use client"` a bez hookov — vykreslí ho server aj klient.
   Živé „teraz" dodá volajúci cez `day.nowMin`.

   Farby: škola je sivý blok, porada a udalosť obrys (sú to fakty, nie práca),
   úloha nesie farbu oblasti a priorita dňa jantárovú výplň. Minulosť je
   prekrytá podkladom, aby sa oko chytilo až toho, čo ešte príde.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DayStripProps {
  day: DayTimeline;
  /** Miesto pre úlohu, ktorá ešte neexistuje (zachytenie). */
  ghost?: TimelineGap | null;
  /**
   * `sm` = 20 px pás bez popisov hodín (do hlavičky), `md` = 28 px s popismi,
   * `lg` = 40 px na počítači: bloky nesú vlastný popis (predmet, udalosť),
   * keď sa doň zmestí, a hodiny sú popísané každé dve.
   */
  size?: "sm" | "md" | "lg";
  className?: string;
}

function pct(min: number, day: DayTimeline): number {
  const span = day.dayEndMin - day.dayStartMin;
  if (span <= 0) return 0;
  return ((Math.min(Math.max(min, day.dayStartMin), day.dayEndMin) - day.dayStartMin) / span) * 100;
}

function hourLabels(day: DayTimeline, dense = false): number[] {
  const first = Math.ceil(day.dayStartMin / 60);
  const last = Math.floor(day.dayEndMin / 60);
  const span = last - first;
  if (span <= 0) return [first];
  // Najviac šesť popisov — na 360 px viac nie je čitateľných. Na počítači
  // je miesta dosť na každú druhú hodinu.
  const step = dense ? 2 : Math.max(1, Math.ceil(span / 5));
  const out: number[] = [];
  for (let h = first; h <= last; h += step) out.push(h);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function blockClass(block: TimelineBlock): string {
  if (block.kind === "lesson") return "bg-border-strong";
  if (block.kind === "meeting" || block.kind === "event") {
    return "border-2 border-fg bg-transparent";
  }
  if (block.isFrog) return "bg-frog-fill";
  return "";
}

function blockStyle(block: TimelineBlock, day: DayTimeline): CSSProperties {
  const left = pct(block.startMin, day);
  const width = Math.max(pct(block.endMin, day) - left, 0.8);
  const style: CSSProperties = { left: `${left}%`, width: `${width}%` };
  if (block.kind === "task" && !block.isFrog) {
    style.backgroundColor = block.areaColor
      ? areaColorValue(block.areaColor)
      : "var(--accent)";
  }
  return style;
}

function clock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Veta pre čítačku — pás samotný je obrázok. */
export function dayStripLabel(day: DayTimeline, ghost?: TimelineGap | null): string {
  const parts = [
    `Deň od ${clock(day.dayStartMin)} do ${clock(day.dayEndMin)}`,
    `naplánované ${formatDuration(day.plannedMin)}`,
    `voľné ${formatDuration(day.freeMin)}`,
  ];
  if (ghost) parts.push(`nová úloha sa zmestí od ${clock(ghost.startMin)}`);
  return parts.join(", ");
}

/**
 * Popis vnútri bloku na veľkom páse. Len keď je blok aspoň takto široký
 * (v percentách dňa) — užší by z textu nechal tri bodky.
 */
const LG_LABEL_MIN_PCT = 3.2;

function lgBlockClass(block: TimelineBlock): string {
  if (block.kind === "lesson") return "bg-border-strong/70 text-fg";
  if (block.kind === "meeting" || block.kind === "event") {
    return "border border-energy-low/60 bg-energy-low/20 text-fg";
  }
  if (block.isFrog) return "bg-frog-fill text-on-frog";
  return "text-white";
}

export function DayStrip({ day, ghost = null, size = "md", className }: DayStripProps) {
  const now = day.nowMin;
  const showNow = now !== null && now > day.dayStartMin && now < day.dayEndMin;
  const lg = size === "lg";

  return (
    <div className={cn("w-full", className)}>
      <div
        role="img"
        aria-label={dayStripLabel(day, ghost)}
        className={cn(
          "relative w-full overflow-hidden bg-surface ring-1 ring-border",
          lg ? "h-10 rounded-md bg-surface-2" : "rounded-full",
          size === "sm" ? "h-5" : size === "md" ? "h-7" : null,
        )}
      >
        {/* Mriežka hodín — len na veľkom páse, aby sa dalo odčítať, kde čo je. */}
        {lg
          ? hourLabels(day, true).map((h) => (
              <span
                key={`g${h}`}
                aria-hidden="true"
                className="absolute inset-y-0 w-px bg-border"
                style={{ left: `${pct(h * 60, day)}%` }}
              />
            ))
          : null}

        {day.blocks.map((block) => {
          const style = blockStyle(block, day);
          if (!lg) {
            return (
              <span
                key={`${block.kind}-${block.id}`}
                className={cn("absolute inset-y-1 rounded-sm", blockClass(block))}
                style={style}
              />
            );
          }
          const widthPct = Math.max(pct(block.endMin, day) - pct(block.startMin, day), 0);
          return (
            <span
              key={`${block.kind}-${block.id}`}
              className={cn(
                "absolute inset-y-1 flex items-center overflow-hidden rounded px-1.5",
                lgBlockClass(block),
              )}
              style={style}
            >
              {widthPct >= LG_LABEL_MIN_PCT ? (
                <span className="truncate font-mono text-micro font-medium">{block.label}</span>
              ) : null}
            </span>
          );
        })}

        {ghost && (
          <span
            className="absolute inset-y-0.5 rounded-sm border-2 border-dashed border-fg bg-accent-badge"
            style={{
              left: `${pct(ghost.startMin, day)}%`,
              width: `${Math.max(pct(ghost.endMin, day) - pct(ghost.startMin, day), 1.2)}%`,
            }}
          />
        )}

        {showNow && (
          <>
            {/* Minulosť stlmená podkladom, nie skrytá — škola ráno sa ráta. */}
            <span
              className={cn("absolute inset-y-0 left-0 bg-bg", lg ? "opacity-45" : "opacity-60")}
              style={{ width: `${pct(now, day)}%` }}
            />
            <span
              className={cn("absolute inset-y-0 w-0.5 -translate-x-1/2", lg ? "bg-accent" : "bg-fg")}
              style={{ left: `${pct(now, day)}%` }}
            />
          </>
        )}
      </div>

      {size !== "sm" && (
        <div className="relative mt-1 h-4 font-mono text-micro tabular-nums text-fg-subtle" aria-hidden="true">
          {hourLabels(day, lg).map((h, i, all) => (
            <span
              key={h}
              className={cn(
                "absolute top-0",
                i === 0 ? "" : i === all.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${pct(h * 60, day)}%` }}
            >
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

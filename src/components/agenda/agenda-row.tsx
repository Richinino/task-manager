"use client";

import type { CSSProperties, ReactNode } from "react";

import { AgendaShape, Countdown, ProgressMini, SubjectChip } from "@/components/agenda/agenda-bits";
import { useAgendaDetail } from "@/components/agenda/agenda-detail-provider";
import {
  agendaLastDay,
  agendaTimeLabel,
  agendaTimeRange,
  agendaTypeShort,
  countdownSk,
  isAgendaPast,
  isAssessment,
  isMultiDay,
  shortDaySk,
} from "@/lib/agenda";
import { diffDays, formatDayMonthSk, parseIsoDate, WEEKDAYS_SHORT_SK } from "@/lib/dates";
import { pluralSk } from "@/lib/sk";
import { cn } from "@/lib/utils";
import type { AgendaItemRow } from "@/server/queries/agenda";

/**
 * Riadok udalosti — jeden komponent pre Dnes, „Blíži sa" aj obrazovku
 * Udalostí, v troch hustotách:
 *
 * - `today` — čas vľavo, ako porady; deň je jasný z obrazovky,
 * - `upcoming` — deň a odpočet vľavo, lebo práve ten je otázka,
 * - `list` — dátum ako blok, vpravo odpočet alebo známka.
 *
 * **Bez zaškrtávacieho políčka.** Udalosť sa nerobí, zažije sa. Celý riadok
 * je tlačidlo, ktoré otvorí detail.
 */
export function AgendaRow({
  item,
  todayIso,
  variant,
  beforeOpen,
  className,
}: {
  item: AgendaItemRow;
  todayIso: string;
  variant: "today" | "upcoming" | "list";
  /** Zavrie panel, z ktorého sa otvára — dva dialógy na sebe by sa bili o Escape. */
  beforeOpen?: () => void;
  className?: string;
}) {
  const detail = useAgendaDetail();
  const past = isAgendaPast(item, todayIso);
  const cancelled = item.cancelledAt !== null;
  const days = diffDays(todayIso, item.date);
  const assessment = item.kind === "event" && isAssessment(item.type);

  const parts: ReactNode[] = [];
  if (variant !== "today") {
    if (isMultiDay(item)) {
      parts.push(
        <span key="kedy" className="font-mono">
          {shortDaySk(item.date)} – {shortDaySk(agendaLastDay(item))}
        </span>,
      );
    } else {
      const range = item.kind === "deadline" ? agendaTimeLabel(item) : agendaTimeRange(item);
      if (range !== null) parts.push(<span key="kedy" className="font-mono">{range}</span>);
    }
  }
  if (item.subject !== null) {
    parts.push(<SubjectChip key="predmet" code={item.subject.code} color={item.subject.color} />);
  }
  if (item.kind === "deadline") {
    parts.push(<span key="druh">{item.type === "submit" ? "deadline · odovzdanie" : "deadline"}</span>);
  } else if (assessment) {
    parts.push(
      <span key="druh" className="font-medium text-warn">
        {agendaTypeShort(item.type)}
      </span>,
    );
  } else if (isMultiDay(item)) {
    const n = diffDays(item.date, agendaLastDay(item)) + 1;
    parts.push(<span key="druh">{`${n} ${pluralSk(n, "deň", "dni", "dní")}`}</span>);
  }
  if (item.period !== null) parts.push(<span key="hodina">{item.period}. hodina</span>);
  else if (item.place) parts.push(<span key="miesto">{item.place}</span>);
  if (cancelled) parts.push(<span key="zrusena">zrušená</span>);

  const sub = parts.flatMap((part, i) =>
    i === 0 ? [part] : [<span key={`s${i}`} aria-hidden="true" className="text-fg-subtle">·</span>, part],
  );

  let right: ReactNode = null;
  if (variant === "list" && past) {
    right = assessment ? (
      item.grade !== null ? (
        <span
          title="Známka"
          className="inline-flex size-6 items-center justify-center rounded border border-border-strong font-mono text-body font-semibold"
        >
          {item.grade}
        </span>
      ) : (
        <span className="whitespace-nowrap font-mono text-mini text-fg-subtle">zapísať známku</span>
      )
    ) : null;
  } else {
    right = (
      <>
        {variant === "list" ? <Countdown days={days} label={countdownSk(item.date, todayIso)} /> : null}
        {item.progress.total > 0 ? (
          <ProgressMini progress={item.progress} />
        ) : assessment && !cancelled && !past ? (
          <span className="hidden whitespace-nowrap font-mono text-mini text-fg-subtle sm:inline">bez prípravy</span>
        ) : null}
      </>
    );
  }

  const d = parseIsoDate(item.date);

  return (
    <button
      type="button"
      onClick={() => {
        if (detail === null) return;
        beforeOpen?.();
        detail.open(item);
      }}
      disabled={detail === null}
      className={cn(
        "grid w-full items-center gap-2.5 border-b border-border bg-surface px-4 py-2 text-left md:px-5",
        "min-h-12 transition-colors duration-100 hover:bg-surface-2 disabled:cursor-default",
        variant === "today" && "grid-cols-[12px_4.25rem_minmax(0,1fr)_auto] md:grid-cols-[12px_4.5rem_minmax(0,1fr)_auto]",
        variant === "upcoming" && "grid-cols-[4.5rem_12px_minmax(0,1fr)_auto] md:grid-cols-[5.25rem_12px_minmax(0,1fr)_auto]",
        variant === "list" && "grid-cols-[2.75rem_12px_minmax(0,1fr)_auto] md:grid-cols-[3.25rem_12px_minmax(0,1fr)_auto]",
        className,
      )}
    >
      {variant === "today" ? (
        <>
          <AgendaShape kind={item.kind} type={item.type} />
          <span className="whitespace-nowrap font-mono text-meta font-medium tabular-nums">{agendaTimeLabel(item)}</span>
        </>
      ) : variant === "upcoming" ? (
        <>
          <span className="flex flex-col whitespace-nowrap">
            <span className="font-mono text-meta font-medium tabular-nums">{shortDaySk(item.date)}</span>
            <Countdown days={days} label={countdownSk(item.date, todayIso)} />
          </span>
          <AgendaShape kind={item.kind} type={item.type} />
        </>
      ) : (
        <>
          <span className="flex flex-col leading-tight">
            <span className="font-mono text-micro uppercase tracking-[0.08em] text-fg-muted">
              {WEEKDAYS_SHORT_SK[d.getDay()]}
            </span>
            <span className="whitespace-nowrap font-mono text-body font-semibold tabular-nums">
              {formatDayMonthSk(item.date)}
            </span>
          </span>
          <AgendaShape kind={item.kind} type={item.type} />
        </>
      )}

      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-body",
            cancelled ? "text-fg-subtle line-through" : past && variant === "list" ? "text-fg-muted" : "font-medium text-fg",
          )}
        >
          {item.title}
        </span>
        {sub.length > 0 ? (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta text-fg-muted">{sub}</span>
        ) : null}
      </span>

      <span className="flex items-center justify-end gap-2.5">{right}</span>
    </button>
  );
}

/**
 * Udalosť ako kompaktný štítok — do stĺpca týždňa a do bunky mesiaca.
 *
 * Krátky názov („písomka MAT") a čas; celý názov je v `title` a v detaile.
 * Bez zaškrtávacieho políčka a mimo ťahania úloh: udalosť sa presúva
 * v detaile, nie potiahnutím medzi dňami — presun písomky je iná vec než
 * presun úlohy (hľadá sa nová hodina, ponúka sa posun prípravy).
 */
export function AgendaChip({ item, className }: { item: AgendaItemRow; className?: string }) {
  const detail = useAgendaDetail();
  const cancelled = item.cancelledAt !== null;
  const time = item.kind === "deadline" || isMultiDay(item) || item.startTime !== null ? agendaTimeLabel(item) : null;
  const short = assessmentShort(item);

  return (
    <button
      type="button"
      title={item.title}
      onClick={() => detail?.open(item)}
      disabled={detail === null}
      className={cn(
        "grid w-full grid-cols-[12px_minmax(0,1fr)] items-center gap-x-1.5 rounded border border-border bg-surface px-1.5 py-1 text-left",
        "transition-colors duration-100 hover:border-border-strong disabled:cursor-default",
        className,
      )}
    >
      <AgendaShape kind={item.kind} type={item.type} />
      <span className={cn("truncate text-mini font-medium", cancelled ? "text-fg-subtle line-through" : "text-fg")}>
        {short}
      </span>
      {time !== null ? (
        <span className="col-start-2 truncate font-mono text-micro tabular-nums text-fg-muted">
          {item.period !== null ? `${item.period}. h · ` : ""}
          {time}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Viacdňová udalosť ako pruh cez dni týždňa v mesiaci.
 *
 * Pozíciu (stĺpce, riadok, pruh) dáva mriežka cez `style`; komponent len
 * kreslí. Kus, ktorý pokračuje z minulého týždňa alebo do ďalšieho, nemá na
 * tej strane zaoblenie ani farebný okraj — pruh tak vizuálne „prechádza"
 * cez koniec riadka.
 */
export function AgendaBar({
  item,
  continuesBefore,
  continuesAfter,
  className,
  style,
}: {
  item: AgendaItemRow;
  continuesBefore: boolean;
  continuesAfter: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const detail = useAgendaDetail();
  const cancelled = item.cancelledAt !== null;
  const label = `${item.title}, ${shortDaySk(item.date)} – ${shortDaySk(agendaLastDay(item))}${cancelled ? ", zrušená" : ""}`;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => detail?.open(item)}
      disabled={detail === null}
      style={style}
      className={cn(
        "relative z-10 flex h-4 min-w-0 items-center self-end rounded-[3px] border border-border-strong bg-surface-2",
        "px-1 text-left text-micro font-medium text-fg md:h-5 md:px-2 md:text-mini",
        "transition-colors duration-100 hover:border-fg-muted disabled:cursor-default",
        continuesBefore ? "rounded-l-none border-l-0" : "border-l-[3px] border-l-fg-muted",
        continuesAfter && "rounded-r-none border-r-0",
        cancelled && "text-fg-subtle line-through",
        className,
      )}
    >
      <span className="min-w-0 truncate">{item.title}</span>
    </button>
  );
}

/** „písomka MAT" pri písomke, inak názov. */
function assessmentShort(item: AgendaItemRow): string {
  return item.kind === "event" && isAssessment(item.type)
    ? [agendaTypeShort(item.type), item.subject?.code].filter(Boolean).join(" ")
    : item.title;
}

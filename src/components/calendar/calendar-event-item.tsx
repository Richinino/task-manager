import type { ReactNode } from "react";
import { ExternalLink, Repeat, Video } from "lucide-react";

import { CalendarDot } from "@/components/calendar/calendar-dot";
import { formatDayMonthSk } from "@/lib/dates";
import {
  EVENT_KIND_LABEL,
  RESPONSE_LABEL,
  reminderLabel,
  type CalendarEvent,
} from "@/lib/google-calendar";
import { cn } from "@/lib/utils";

/**
 * Jedna udalosť z Google Kalendára — riadok, ktorý sa rozbalí do detailu.
 *
 * `<details>` namiesto vlastného stavu: rozbaľovanie zvládne prehliadač sám,
 * komponent ostáva serverový a na telefóne nestojí ani riadok javascriptu.
 *
 * Všetko sú CUDZIE dáta z Google. Vykresľujú sa výhradne ako text cez JSX,
 * ktorý ich escapuje — nikdy ako HTML. Odkazy sa pustia len na `https:`.
 */

/** `08:30–09:00`, pri viacdňovej s dátumami. `null` pri celodennej. */
export function calendarTimeLabel(event: CalendarEvent): string | null {
  if (event.allDay) {
    return event.endDate > event.startDate
      ? `${formatDayMonthSk(event.startDate)}–${formatDayMonthSk(event.endDate)}`
      : null;
  }
  if (event.start === null) return null;
  const end = event.end === null ? "" : `–${event.end}`;
  if (event.endDate > event.startDate) {
    return `${formatDayMonthSk(event.startDate)} ${event.start}–${formatDayMonthSk(event.endDate)} ${event.end ?? ""}`.trim();
  }
  return `${event.start}${end}`;
}

/** Krátke poznámky pod názvom: kalendár, miesto, druh, „voľný"… */
export function calendarMeta(event: CalendarEvent): string[] {
  const kind = EVENT_KIND_LABEL[event.kind];
  return [
    event.calendarName,
    ...(event.location !== null ? [event.location] : []),
    ...(kind !== null ? [kind] : []),
    ...(event.category !== null ? [event.category] : []),
    ...(event.tentative ? ["nepotvrdené"] : []),
    ...(!event.allDay && !event.busy ? ["voľný čas"] : []),
    ...(!event.allDay && event.busy && !event.countsInBudget ? ["mimo rozpočtu"] : []),
  ];
}

function safeLink(url: string | null): string | null {
  return url !== null && url.startsWith("https://") ? url : null;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-20 shrink-0 text-fg-subtle">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-fg-muted">{children}</dd>
    </div>
  );
}

export function CalendarEventItem({
  event,
  showTime = true,
  className,
}: {
  event: CalendarEvent;
  /** Čas pred názvom. Celodenné ho nemajú. */
  showTime?: boolean;
  className?: string;
}) {
  const time = showTime ? calendarTimeLabel(event) : null;
  const meta = calendarMeta(event);
  const link = safeLink(event.link);
  const meet = safeLink(event.meetLink);

  return (
    <li className={className}>
      <details className="group">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-start gap-2.5 px-3 py-1.5 sm:min-h-0",
            "rounded transition-colors duration-100 hover:bg-surface-2 [&::-webkit-details-marker]:hidden",
          )}
        >
          <CalendarDot color={event.color} className="mt-1.5" />
          {time === null ? null : (
            // Časy majú pod sebou držať stĺpec, preto font-mono tabular-nums.
            <span className="mt-px shrink-0 font-mono text-xs tabular-nums whitespace-nowrap text-fg-muted">
              {time}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                "min-w-0 truncate text-sm text-fg group-open:whitespace-normal",
                event.tentative && "text-fg-muted",
              )}
            >
              {event.title}
              {event.recurring ? (
                <Repeat aria-label="opakuje sa" size={11} className="ml-1.5 inline align-[-1px] text-fg-subtle" />
              ) : null}
            </span>
            <span className="min-w-0 truncate text-meta text-fg-subtle group-open:whitespace-normal">
              {meta.join(" · ")}
            </span>
          </span>
        </summary>

        <div className="flex flex-col gap-2 pb-2.5 pl-[1.625rem] pr-3 pt-1 text-meta">
          {event.description !== null ? (
            <p className="whitespace-pre-line break-words text-body text-fg">{event.description}</p>
          ) : null}

          <dl className="flex flex-col gap-1">
            {event.location !== null ? <DetailRow label="Miesto">{event.location}</DetailRow> : null}
            <DetailRow label="Kalendár">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDot color={event.color} />
                {event.calendarName}
                {event.category !== null ? ` · farba ${event.category.toLowerCase()}` : null}
              </span>
            </DetailRow>
            <DetailRow label="Čas dňa">
              {event.allDay
                ? "celodenná — do rozpočtu času sa neráta"
                : !event.busy
                  ? "v Google označená ako voľný čas — neráta sa"
                  : event.countsInBudget
                    ? "ráta sa do rozpočtu dňa"
                    : "neráta sa (kalendár nemá zapnuté „Do času dňa“)"}
            </DetailRow>
            {event.createdBy !== null ? <DetailRow label="Pridal">{event.createdBy}</DetailRow> : null}
            {event.response !== null ? (
              <DetailRow label="Ty">{RESPONSE_LABEL[event.response]}</DetailRow>
            ) : null}
            {event.attendees.filter((a) => !a.self).length > 0 ? (
              <DetailRow label="Hostia">
                {event.attendees
                  .filter((a) => !a.self)
                  .map((a) =>
                    a.response === null
                      ? a.name
                      : `${a.name} (${RESPONSE_LABEL[a.response]}${a.organizer ? ", organizátor" : ""})`,
                  )
                  .join(", ")}
              </DetailRow>
            ) : null}
            {event.recurring ? <DetailRow label="Opakuje sa">áno</DetailRow> : null}
            {event.reminders.length > 0 ? (
              <DetailRow label="Pripomienky">{event.reminders.map(reminderLabel).join(", ")}</DetailRow>
            ) : null}
            {event.private ? <DetailRow label="Viditeľnosť">súkromná</DetailRow> : null}
          </dl>

          {link !== null || meet !== null ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {meet !== null ? (
                <a
                  href={meet}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-accent hover:underline sm:min-h-0"
                >
                  <Video aria-hidden="true" size={13} />
                  Pripojiť sa k hovoru
                </a>
              ) : null}
              {link !== null ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-accent hover:underline sm:min-h-0"
                >
                  <ExternalLink aria-hidden="true" size={13} />
                  Otvoriť v Google Kalendári
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/**
 * Úzka verzia pre stĺpec týždňa a bunku mesiaca: bodka, čas, názov.
 * Po rozbalení poznámky, popis a odkaz do Google — celý detail je na Dnes.
 */
export function CalendarEventChip({ event }: { event: CalendarEvent }) {
  const time = event.allDay ? null : event.start;
  const meta = calendarMeta(event);
  const link = safeLink(event.link);
  const range = event.allDay ? calendarTimeLabel(event) : null;

  return (
    <details className="group min-w-0">
      <summary
        title={[event.title, ...meta].join(" · ")}
        className={cn(
          "flex min-h-11 min-w-0 cursor-pointer list-none items-center gap-1.5 rounded px-1 py-0.5 sm:min-h-0",
          "text-meta transition-colors duration-100 hover:bg-surface-2 [&::-webkit-details-marker]:hidden",
          !event.busy && !event.allDay && "opacity-75",
        )}
      >
        <CalendarDot color={event.color} />
        {time !== null ? (
          <span className="shrink-0 font-mono tabular-nums text-fg-subtle">{time}</span>
        ) : null}
        <span className="min-w-0 truncate text-fg-muted group-open:whitespace-normal">{event.title}</span>
      </summary>
      <div className="flex flex-col gap-1 px-1 pb-1.5 pl-[1.125rem] pt-0.5 text-mini text-fg-subtle">
        {range !== null ? <span>{range}</span> : null}
        {!event.allDay && event.end !== null ? (
          <span className="font-mono tabular-nums">
            {event.start}–{event.end}
          </span>
        ) : null}
        <span className="break-words">{meta.join(" · ")}</span>
        {event.description !== null ? (
          <span className="line-clamp-6 whitespace-pre-line break-words text-fg-muted">{event.description}</span>
        ) : null}
        {link !== null ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-accent hover:underline sm:min-h-0"
          >
            <ExternalLink aria-hidden="true" size={11} />
            Google Kalendár
          </a>
        ) : null}
      </div>
    </details>
  );
}

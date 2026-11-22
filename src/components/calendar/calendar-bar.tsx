import type { CSSProperties } from "react";

import { calendarMeta, calendarTimeLabel } from "@/components/calendar/calendar-event-item";
import type { CalendarEvent } from "@/lib/google-calendar";
import { cn } from "@/lib/utils";

/**
 * Pruh viacdňovej udalosti z Google Kalendára v mriežke mesiaca.
 *
 * Kreslí sa ako pruh udalosti appky (`AgendaBar`), len ľavý okraj nesie farbu
 * kalendára. Ťuknutie otvorí udalosť v Google — detail appka nemá, je to
 * cudzia udalosť len na čítanie.
 */
export function CalendarBar({
  event,
  continuesBefore,
  continuesAfter,
  className,
  style,
}: {
  event: CalendarEvent;
  continuesBefore: boolean;
  continuesAfter: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const range = calendarTimeLabel(event);
  const label = [event.title, range, ...calendarMeta(event)].filter(Boolean).join(" · ");
  const color = event.color !== null && /^#[0-9a-f]{3,8}$/i.test(event.color) ? event.color : null;
  const link = event.link !== null && event.link.startsWith("https://") ? event.link : null;

  const classes = cn(
    "relative z-10 flex h-4 min-w-0 items-center self-end rounded-[3px] border border-border bg-surface",
    "px-1 text-left text-micro text-fg-muted md:h-5 md:px-2 md:text-mini",
    "transition-colors duration-100 hover:border-fg-muted",
    continuesBefore ? "rounded-l-none border-l-0" : "border-l-[3px]",
    continuesAfter && "rounded-r-none border-r-0",
    className,
  );
  const barStyle: CSSProperties = {
    ...style,
    ...(color !== null && !continuesBefore ? { borderLeftColor: color } : {}),
  };

  return link !== null ? (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={`${label}. Otvoriť v Google Kalendári.`}
      style={barStyle}
      className={classes}
    >
      <span className="min-w-0 truncate">{event.title}</span>
    </a>
  ) : (
    <span title={label} style={barStyle} className={classes}>
      <span className="min-w-0 truncate">{event.title}</span>
    </span>
  );
}

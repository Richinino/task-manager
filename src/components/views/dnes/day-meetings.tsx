import { CalendarClock } from "lucide-react";

import { CalendarEventItem } from "@/components/calendar/calendar-event-item";
import type { DayCalendarEvent } from "@/lib/google-calendar";
import { cn } from "@/lib/utils";

export interface DayMeetingsProps {
  /**
   * Bez vlastnej karty — sekciu vtedy ohraničuje pravá lišta.
   * V návrhu je KALENDÁR jedna zo štyroch sekcií vnútri jednej plochy,
   * nie samostatná kartička.
   */
  flush?: boolean;
  /** Udalosti dňa z Google Kalendára, celodenné prvé, potom podľa začiatku. */
  events: readonly DayCalendarEvent[];
}

/**
 * Udalosti dňa zo všetkých zobrazených kalendárov.
 *
 * Doplnok k rozpočtu času: rozpočet povie, koľko času udalosti zjedli, tento
 * zoznam povie, ktoré to boli. Každý riadok sa rozbalí do detailu — miesto,
 * popis, kto ju pridal, hostia, pripomienky, odkaz do Google.
 *
 * Keď v kalendári nič nie je — alebo kalendár vôbec nie je pripojený —
 * komponent nevykreslí nič. Výzva na pripojenie by z doplnku robila
 * povinnosť; appka bez kalendára funguje ďalej a nemá to komentovať.
 */
export function DayMeetings({ events, flush = false }: DayMeetingsProps) {
  if (events.length === 0) return null;

  const timed = events.filter((event) => !event.allDay);
  const allDay = events.filter((event) => event.allDay);

  return (
    <section
      aria-labelledby="dnes-kalendar"
      className={cn(!flush && "rounded border border-border bg-surface")}
    >
      <h2
        id="dnes-kalendar"
        className={cn(
          "label flex min-w-0 items-center gap-2 text-fg-muted",
          flush ? "pb-2" : "px-3 pb-1.5 pt-2.5",
        )}
      >
        <CalendarClock aria-hidden="true" size={13} className="shrink-0" />
        <span className="min-w-0 truncate">Kalendár</span>
      </h2>

      {timed.length > 0 ? (
        <ul className={cn("flex flex-col", flush && "-mx-3")}>
          {timed.map((event) => (
            <CalendarEventItem key={event.id} event={event} />
          ))}
        </ul>
      ) : null}

      {allDay.length > 0 ? (
        // Celodenné udalosti nemajú čas a rozpočet nemenia — „dovolenka"
        // hodiny neujedá. Preto stoja zvlášť, pod vysvetľujúcou poznámkou.
        <div className={cn("border-t border-border py-2", !flush && "px-0", timed.length === 0 && "border-t-0")}>
          <p className={cn("text-body text-fg-subtle sm:text-xs", flush ? "" : "px-3")}>
            Celodenné — do rozpočtu času sa nerátajú.
          </p>
          <ul className={cn("mt-1 flex flex-col", flush && "-mx-3")}>
            {allDay.map((event) => (
              <CalendarEventItem key={event.id} event={event} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

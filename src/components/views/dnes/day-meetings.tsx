import { CalendarClock } from "lucide-react";

import type { CalendarEvent } from "@/server/queries/calendar";

export interface DayMeetingsProps {
  /** Udalosti dňa z kalendára, zoradené podľa začiatku. */
  events: readonly CalendarEvent[];
}

/**
 * Čas porady ako `08:30–09:00`. `null`, keď sa čas nedá zložiť.
 *
 * Google občas vráti pečiatku, ktorú sa nepodarí naformátovať (`start` je
 * potom `null`), a stáva sa aj to, že chýba koniec. Radšej ukážeme názov bez
 * času než riadok s pomlčkou, ktorá nič nehovorí.
 */
function timeRange(event: CalendarEvent): string | null {
  if (event.start === null) return null;
  return event.end === null ? event.start : `${event.start}–${event.end}`;
}

/**
 * Časová os porád dňa.
 *
 * Doplnok k rozpočtu času: rozpočet povie, koľko času porady zjedli, tento
 * zoznam povie, ktoré to boli. Preto sedí hneď pod ním.
 *
 * Keď v kalendári nič nie je — alebo kalendár vôbec nie je pripojený a
 * `getDayEvents` vrátil prázdne pole — komponent nevykreslí nič. Sekcia
 * „žiadne porady" je šum a výzva na pripojenie kalendára by z doplnku robila
 * povinnosť; appka bez kalendára funguje ďalej a nemá to komentovať.
 *
 * Názvy porád sú CUDZIE dáta z Google Calendar. Vykresľujú sa výhradne ako
 * text cez JSX, ktorý ich escapuje — nikdy ako HTML.
 */
export function DayMeetings({ events }: DayMeetingsProps) {
  if (events.length === 0) return null;

  const timed = events.filter((event) => !event.allDay);
  const allDay = events.filter((event) => event.allDay);

  return (
    <section
      aria-labelledby="dnes-porady"
      className="rounded border border-border bg-surface"
    >
      <h2
        id="dnes-porady"
        className="flex min-w-0 items-center gap-2 px-3 pt-2.5 pb-1.5 text-sm font-semibold text-fg"
      >
        <CalendarClock aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
        <span className="min-w-0 truncate">Porady</span>
      </h2>

      {timed.length > 0 ? (
        <ul className="flex flex-col">
          {timed.map((event) => {
            const range = timeRange(event);
            return (
              <li
                key={event.id}
                className="flex min-h-11 items-center gap-3 px-3 py-1.5 sm:min-h-0"
              >
                {range === null ? null : (
                  // Časy sú v pásme používateľa a majú pod sebou držať stĺpec,
                  // preto tabular-nums a žiadne zalamovanie.
                  <span className="shrink-0 text-xs tabular-nums whitespace-nowrap text-fg-muted">
                    {range}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {event.title}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {allDay.length > 0 ? (
        // Celodenné udalosti nemajú čas a rozpočet nemenia — „dovolenka"
        // hodiny neujedá. Preto stoja zvlášť, pod vysvetľujúcou poznámkou,
        // a nie premiešané medzi poradami.
        <div className="border-t border-border px-3 py-2">
          <p className="text-[13px] text-fg-subtle sm:text-xs">
            Celodenné — do rozpočtu času sa nerátajú.
          </p>
          <ul className="mt-1 flex flex-col">
            {allDay.map((event) => (
              <li
                key={event.id}
                className="flex min-h-11 items-center py-1 sm:min-h-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {event.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

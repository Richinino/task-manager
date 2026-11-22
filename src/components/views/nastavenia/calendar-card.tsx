import { CalendarCheck, CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CalendarList,
  type CalendarListRow,
} from "@/components/views/nastavenia/calendar-list";
import { connectCalendar, disconnectCalendar } from "@/server/actions/calendar";

/**
 * Prepojenie s Google Kalendárom.
 *
 * Serverový komponent — obe akcie sú obyčajné formuláre, takže na to netreba
 * ani riadok javascriptu v prehliadači. Rovnaký vzor ako odhlásenie.
 *
 * Zámerne stojí mimo `SettingsForm`: ten sa ukladá sám po poliach a drží si
 * rozpracovaný stav. Toto sa neukladá, ale **odchádza ku Googlu a späť** —
 * miešať to do formulára, ktorý sa ukladá po písmenách, by mýlilo.
 */
export function CalendarCard({
  connected,
  calendars = [],
}: {
  connected: boolean;
  /** Kalendáre z Google — len keď je prepojený. */
  calendars?: readonly CalendarListRow[];
}) {
  return (
    <section>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-fg">Google Kalendár</h2>
          <p className="text-body leading-relaxed text-fg-muted">
            Keď ho prepojíš, udalosti zo všetkých tvojich kalendárov uvidíš na
            obrazovkách Dnes, Týždeň a Mesiac aj s miestom, popisom, farbou,
            hosťami a odkazom do Google. Čas porád sa odráta z rozpočtu dňa.
            Prístup je <strong className="font-medium">len na čítanie</strong> —
            appka ti do kalendára nikdy nič nezapíše ani nezmaže.
          </p>
        </div>

        {connected ? (
          <div className="flex flex-col gap-3">
            <CalendarList calendars={calendars} />
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-1.5 text-body text-success">
                <CalendarCheck
                  aria-hidden="true"
                  size={15}
                  className="shrink-0"
                />
                Kalendár je prepojený.
              </p>
              <form action={disconnectCalendar} className="ml-auto">
                <Button type="submit" variant="ghost" size="sm">
                  Odpojiť
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <form action={connectCalendar}>
              <Button type="submit" variant="secondary">
                <CalendarPlus aria-hidden="true" size={15} />
                Prepojiť kalendár
              </Button>
            </form>
            <p className="text-meta leading-relaxed text-fg-subtle">
              Google sa ťa spýta na povolenie. Bez neho appka funguje úplne
              rovnako, len bez udalostí z kalendára.
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}

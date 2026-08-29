import type { Metadata } from "next";

import { ScreenHeader } from "@/components/shell/screen-chrome";
import { CalendarCard } from "@/components/views/nastavenia/calendar-card";
import { SettingsNav } from "@/components/views/nastavenia/settings-nav";
import { PushSetup } from "@/components/views/nastavenia/push-setup";
import { SettingsForm } from "@/components/views/nastavenia/settings-form";
import { pushPublicKey } from "@/server/push";
import { requireUser } from "@/server/auth-guard";
import { hasCalendarAccess } from "@/server/google-tokens";

export const metadata: Metadata = {
  title: "Nastavenia",
  description: "Hodiny dňa, limity a prahy, podľa ktorých sa appka správa.",
};

/**
 * Nastavenia.
 *
 * Všetky hodnoty žijú v jednom `jsonb` stĺpci (`users.settings`), takže tu
 * netreba nič skladať — `requireUser()` ich už vracia rozparsované.
 */
export default async function NastaveniaPage() {
  const user = await requireUser();
  const calendarConnected = await hasCalendarAccess(user.id);

  /*
    Bez kľúčov VAPID sa celá sekcia pripomienok nekreslí. Kľúč sa číta na
    serveri a odovzdáva ako obyčajný reťazec — je verejný, na to je.
  */
  const vapidPublicKey = pushPublicKey();

  return (
    <div className="flex w-full flex-col md:h-dvh">
      <ScreenHeader title="Nastavenia" meta="zmeny sa ukladajú okamžite" />

      <div className="flex min-h-0 flex-1">
        <SettingsNav hasPush={vapidPublicKey !== null} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <section aria-label="Google Kalendár">
            <h2 className="label border-b border-border bg-surface-2 px-5 py-[9px] text-fg-muted">
              Google Kalendár
            </h2>
            <div className="border-b border-border px-5 py-4">
              <CalendarCard connected={calendarConnected} />
            </div>
          </section>

          <SettingsForm
            settings={user.settings}
            pushSetup={vapidPublicKey ? <PushSetup publicKey={vapidPublicKey} /> : null}
          />
        </div>
      </div>
    </div>
  );
}

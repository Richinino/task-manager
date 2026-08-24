import type { Metadata } from "next";

import { CalendarCard } from "@/components/views/nastavenia/calendar-card";
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
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-fg">Nastavenia</h1>
        <p className="text-body leading-relaxed text-fg-muted">
          Čísla, podľa ktorých sa appka správa. Ukladajú sa samy — tlačidlo
          „Uložiť“ tu nie je.
        </p>
      </header>

      <CalendarCard connected={calendarConnected} />

      <SettingsForm
        settings={user.settings}
        pushSetup={vapidPublicKey ? <PushSetup publicKey={vapidPublicKey} /> : null}
      />
    </div>
  );
}

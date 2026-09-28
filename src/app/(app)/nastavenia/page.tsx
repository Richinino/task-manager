import type { Metadata } from "next";
import { headers } from "next/headers";

import { ScreenHeader } from "@/components/shell/screen-chrome";
import { CalendarCard } from "@/components/views/nastavenia/calendar-card";
import { ConnectedAppsCard } from "@/components/views/nastavenia/connected-apps-card";
import { SettingsNav } from "@/components/views/nastavenia/settings-nav";
import { PushSetup } from "@/components/views/nastavenia/push-setup";
import { SettingsForm } from "@/components/views/nastavenia/settings-form";
import { SubjectAliasesCard } from "@/components/views/nastavenia/subject-aliases-card";
import { builtInAliases } from "@/lib/subject-match";
import { pushPublicKey } from "@/server/push";
import { requireUser } from "@/server/auth-guard";
import { hasCalendarAccess } from "@/server/google-tokens";
import { listConnectedApps, mcpResource, originOf } from "@/server/oauth";
import { listSubjects } from "@/server/queries/school";

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
  const [calendarConnected, apps, subjects] = await Promise.all([
    hasCalendarAccess(user.id),
    listConnectedApps(user.id),
    listSubjects(user.id),
  ]);
  const mcpUrl = mcpResource(originOf(await headers()));

  /* Dátumy pripojení v pásme používateľa, ako všade inde v appke. */
  const when = new Intl.DateTimeFormat("sk-SK", {
    timeZone: user.settings.timezone,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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

          <section aria-label="Pripojené aplikácie">
            <h2 className="label border-b border-border bg-surface-2 px-5 py-[9px] text-fg-muted">
              Pripojené aplikácie
            </h2>
            <div className="border-b border-border px-5 py-4">
              <ConnectedAppsCard
                mcpUrl={mcpUrl}
                apps={apps.map((app) => ({
                  id: app.id,
                  clientName: app.clientName,
                  createdLabel: when.format(app.createdAt),
                  lastUsedLabel: app.lastUsedAt === null ? null : when.format(app.lastUsedAt),
                }))}
              />
            </div>
          </section>

          <section aria-label="Predmety">
            <h2 className="label border-b border-border bg-surface-2 px-5 py-[9px] text-fg-muted">
              Predmety
            </h2>
            <div className="border-b border-border px-5 py-4">
              <SubjectAliasesCard
                subjects={subjects.map((subject) => ({
                  code: subject.code,
                  name: subject.name,
                  builtIn: builtInAliases(subject),
                  aliases: user.settings.subjectAliases[subject.code] ?? [],
                }))}
              />
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

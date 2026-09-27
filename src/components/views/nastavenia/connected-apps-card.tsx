import { PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { disconnectApp } from "@/server/actions/connected-apps";

/**
 * Pripojené aplikácie — Claude a iní MCP klienti (docs/MCP.md).
 *
 * Serverový komponent ako `CalendarCard`: odpojenie je obyčajný formulár.
 * Adresa servera je tu preto, lebo ju človek vkladá do Clauda — bez nej by
 * ju musel skladať z adresy appky sám.
 */
export interface ConnectedAppRow {
  id: string;
  clientName: string;
  /** Hotový text zo servera — klient nepozná pásmo používateľa. */
  createdLabel: string;
  lastUsedLabel: string | null;
}

export function ConnectedAppsCard({ mcpUrl, apps }: { mcpUrl: string; apps: readonly ConnectedAppRow[] }) {
  return (
    <section>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-fg">Claude a iné aplikácie (MCP)</h2>
          <p className="text-body leading-relaxed text-fg-muted">
            Claude vie čítať tvoj deň a urobiť s tebou ranný rituál. V Claude otvor{" "}
            <strong className="font-medium">Settings → Connectors → Add custom connector</strong>,
            vlož túto adresu a prihlás sa rovnako ako sem:
          </p>
          <code className="mt-1 block overflow-x-auto rounded border border-border bg-surface-2 px-3 py-2 font-mono text-meta text-fg">
            {mcpUrl}
          </code>
          <p className="text-meta leading-relaxed text-fg-subtle">
            Funguje v Claude na počítači, na webe aj v mobile. Natvrdo nezmaže nič — úlohy len
            plánuje, zahadzuje a odškrtáva ako ty.
          </p>
        </div>

        {apps.length === 0 ? (
          <p className="text-body text-fg-muted">Zatiaľ nie je pripojená žiadna aplikácia.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded border border-border">
            {apps.map((app) => (
              <li key={app.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <PlugZap aria-hidden="true" size={15} className="shrink-0 text-accent" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium text-fg">{app.clientName}</span>
                  <span className="text-meta text-fg-subtle">
                    pripojené {app.createdLabel}
                    {app.lastUsedLabel !== null ? ` · naposledy ${app.lastUsedLabel}` : " · zatiaľ nepoužité"}
                  </span>
                </div>
                <form action={disconnectApp}>
                  <input type="hidden" name="id" value={app.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={`Odpojiť ${app.clientName}`}>
                    Odpojiť
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

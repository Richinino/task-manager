"use client";

import { useState, useTransition } from "react";
import { Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pairWidget, revokeWidget } from "@/server/actions/device-tokens";

/**
 * Telefón — widget na ploche (docs/dizajn-android/STAVBA-KROK3.md).
 *
 * „Pripojiť widget" vytvorí token a odovzdá ho Android appke cez odkaz
 * `intent://pair`. Token sa tu nikde neukazuje — vidí ho len appka.
 */
export interface PhoneWidgetRow {
  id: string;
  name: string;
  createdLabel: string;
  lastUsedLabel: string | null;
}

export function PhoneCard({ widgets }: { widgets: readonly PhoneWidgetRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pair() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await pairWidget();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.href =
          "intent://pair?token=" +
          encodeURIComponent(result.data.token) +
          "#Intent;scheme=ulohy;package=sk.taskmanazer.app;end";
      } catch {
        setError("Widget sa nepodarilo pripojiť. Skús to znova.");
      }
    });
  }

  function revoke(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await revokeWidget(id);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Widget sa nepodarilo odpojiť. Skús to znova.");
      }
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-fg">Widget na ploche</h2>
        <p className="text-body leading-relaxed text-fg-muted">
          Widget na ploche ukazuje dnešok a dá sa z neho odškrtávať. Funguje len v nainštalovanej
          appke Úlohy.
        </p>
      </div>

      <div>
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={pending}
          onClick={pair}
          className="w-full md:w-auto"
        >
          Pripojiť widget
        </Button>
      </div>

      {error !== null ? (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      ) : null}

      {widgets.length === 0 ? (
        <p className="text-body text-fg-muted">Zatiaľ nie je pripojený žiadny widget.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded border border-border">
          {widgets.map((widget) => (
            <li key={widget.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Smartphone aria-hidden="true" size={15} className="shrink-0 text-accent" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-fg">{widget.name}</span>
                <span className="text-meta text-fg-subtle">
                  pripojené {widget.createdLabel}
                  {widget.lastUsedLabel !== null
                    ? ` · naposledy ${widget.lastUsedLabel}`
                    : " · zatiaľ nepoužité"}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={pending}
                onClick={() => revoke(widget.id)}
                aria-label={`Odpojiť ${widget.name}`}
              >
                Odpojiť
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

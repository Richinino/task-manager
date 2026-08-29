"use client";

import { CloudOff, RefreshCw } from "lucide-react";

import { useOutbox } from "@/components/pwa/outbox-provider";
import { cn } from "@/lib/utils";
import { countSk } from "@/lib/sk";

/**
 * Tichý odznak o stave pripojenia.
 *
 * Zobrazí sa iba vtedy, keď je čo povedať — bez signálu, alebo keď niečo
 * čaká vo fronte. Keď je všetko odoslané, zmizne bez stopy; trvalý pásik
 * „všetko v poriadku" by bol len šum.
 *
 * Živá oblasť (`role="status"`) je v DOM **stále**, aj keď je prázdna.
 * Čítačky obrazovky totiž spoľahlivo ohlásia zmenu obsahu existujúcej
 * oblasti, ale novo vloženú oblasť často preskočia.
 */

export function OfflineIndicator() {
  const outbox = useOutbox();

  const online = outbox?.online ?? true;
  const pending = outbox?.pending ?? 0;
  const visible = outbox !== null && (!online || pending > 0);

  let message: string | null = null;
  if (visible) {
    if (!online && pending > 0) {
      message = `Bez pripojenia — ${countSk(pending, "úloha", "úlohy", "úloh")} sa ${
        pending === 1 ? "odošle" : "odošlú"
      } neskôr`;
    } else if (!online) {
      message = "Bez pripojenia — zobrazujú sa naposledy načítané údaje";
    } else {
      message = `Odosielam — ${countSk(pending, "úloha", "úlohy", "úloh")} čaká`;
    }
  }

  return (
    /*
      Návrh z toho robí pruh navrchu obrazovky nad hlavičkou, nie bublinu
      dole. Je to správne: stav pripojenia nie je oznam, ktorý preletí, ale
      podmienka, v ktorej sa práve pracuje — a keď človek nevie, že je
      offline, nechápe, prečo sa niečo neuložilo.

      Živá oblasť je v DOM **stále**, aj keď je prázdna. Čítačky spoľahlivo
      ohlásia zmenu obsahu existujúcej oblasti, ale novo vloženú často
      preskočia.
    */
    <div role="status" aria-live="polite" aria-atomic="true">
      {message !== null ? (
        <div
          className={cn(
            "animate-in-fast flex items-center gap-2.5 border-b border-border px-5 py-[9px]",
            "shadow-[inset_3px_0_0_var(--warn)]",
            // Podklad je vlastný odtieň varovania — pruh musí byť vidieť aj
            // periférne, ale nesmie kričať ako chyba. Nič sa nestratilo.
            "bg-warn/10",
          )}
        >
          {online ? (
            <RefreshCw
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-warn"
            />
          ) : (
            <CloudOff aria-hidden="true" className="size-3.5 shrink-0 text-warn" />
          )}

          <span className="shrink-0 font-mono text-mini font-semibold uppercase tracking-[0.1em] text-warn">
            {online ? "Odosielam" : "Offline"}
          </span>

          <span className="min-w-0 flex-1 truncate text-body text-fg">{message}</span>

          {pending > 0 ? (
            <span className="hidden shrink-0 font-mono text-mini tabular-nums text-fg-muted sm:block">
              {countSk(pending, "zmena vo fronte", "zmeny vo fronte", "zmien vo fronte")}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

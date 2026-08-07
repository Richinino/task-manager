"use client";

import { CloudOff, RefreshCw } from "lucide-react";

import { useOutbox } from "@/components/pwa/outbox-provider";
import { cn } from "@/lib/utils";

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

/**
 * Slovenské množné číslo: 1 úloha · 2–4 úlohy · 5+ úloh.
 * Bez toho by tam stálo „2 úloh", čo z odznaku spraví amatérčinu.
 */
function tasksSk(count: number): string {
  if (count === 1) return "1 úloha";
  if (count >= 2 && count <= 4) return `${count} úlohy`;
  return `${count} úloh`;
}

export function OfflineIndicator() {
  const outbox = useOutbox();

  const online = outbox?.online ?? true;
  const pending = outbox?.pending ?? 0;
  const visible = outbox !== null && (!online || pending > 0);

  let message: string | null = null;
  if (visible) {
    if (!online && pending > 0) {
      message = `Bez pripojenia — ${tasksSk(pending)} sa ${
        pending === 1 ? "odošle" : "odošlú"
      } neskôr`;
    } else if (!online) {
      message = "Bez pripojenia — zobrazujú sa naposledy načítané údaje";
    } else {
      message = `Odosielam — ${tasksSk(pending)} čaká`;
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex justify-center",
        // Vpravo dole sedí na telefóne plávajúce tlačidlo zachytenia — necháme
        // mu miesto, nech sa odznak nikdy nedostane pod palec.
        "pl-3 pr-[4.5rem] md:pr-3",
        /*
          Nad spodnú lištu, ktorá má 3.5rem a pod sebou bezpečnú zónu telefónu.
          Na desktope lišta nie je, takže stačí odsadenie od spodného okraja.
        */
        "[bottom:calc(3.5rem_+_env(safe-area-inset-bottom)_+_0.5rem)]",
        "md:[bottom:calc(env(safe-area-inset-bottom)_+_1rem)]",
      )}
    >
      {message !== null ? (
        <p
          className={cn(
            "animate-in-fast inline-flex max-w-full items-center gap-1.5 rounded",
            "border border-border-strong bg-surface px-2.5 py-1.5 shadow-md",
            "text-[12px] font-medium text-fg-muted",
          )}
        >
          {online ? (
            <RefreshCw
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-accent"
            />
          ) : (
            <CloudOff aria-hidden="true" className="size-3.5 shrink-0 text-warn" />
          )}
          <span className="truncate">{message}</span>
        </p>
      ) : null}
    </div>
  );
}

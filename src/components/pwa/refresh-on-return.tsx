"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useOutbox } from "@/components/pwa/outbox-provider";
import { shouldRefreshOnReturn } from "@/lib/refresh-on-return";

/**
 * Po návrate do appky potichu dorovná stav zo servera. Nič nevykresľuje.
 *
 * Zmena urobená na inom zariadení — fokus začatý na telefóne, úloha
 * odškrtnutá vo widgete alebo cez Claude — sa inak v už otvorenom okne
 * ukáže až po ďalšej navigácii.
 *
 * `router.refresh()` nie je obnovenie stránky: znova vykreslí serverové
 * komponenty a stav klienta (rozpísaný text, otvorený panel) nechá tak.
 * Preto je bezpečný aj vtedy, keď sa service worker zámerne nikdy stránku
 * neobnovuje sám.
 *
 * Počúvame obe udalosti: `visibilitychange` pri prepnutí karty či návrate
 * z pozadia na telefóne, `focus` pri prepnutí okien na počítači, kde karta
 * ostáva celý čas „visible". Bez siete sa neobnovuje — výsledok by bol len
 * chyba namiesto starých, ale použiteľných dát.
 */
export function RefreshOnReturn(): null {
  const router = useRouter();
  const outbox = useOutbox();
  const online = outbox?.online ?? true;
  /* Načítanie stránky je čerstvé samo osebe — prvé obnovenie až po odstupe. */
  const lastRefreshRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastRefreshRef.current === null) lastRefreshRef.current = Date.now();

    const onReturn = (): void => {
      if (document.visibilityState !== "visible") return;
      if (!online) return;
      const now = Date.now();
      if (!shouldRefreshOnReturn(lastRefreshRef.current ?? 0, now)) return;
      lastRefreshRef.current = now;
      router.refresh();
    };

    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [router, online]);

  return null;
}

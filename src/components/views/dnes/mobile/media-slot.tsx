"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/**
 * Vykreslí obsah len na zodpovedajúcej šírke.
 *
 * Dnes má dva stromy (telefón a počítač), z ktorých jeden je vždy skrytý
 * cez CSS. Skrytý ale ostáva pripojený — a „Čo teraz?" s rituálom by sa
 * tak pripojili dvakrát (rituál sa otvára sám, dvojitý by otvoril dva
 * dialógy). Preto tieto dve veci kreslí vždy len jedna strana.
 *
 * Na serveri sa nekreslí nič; po hydratácii sa pripojí správna strana.
 */
const QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function MediaSlot({
  on,
  children,
}: {
  /** `desktop` = od `md` vyššie, `phone` = pod `md`. */
  on: "desktop" | "phone";
  children: ReactNode;
}) {
  const isDesktop = useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => null,
  );
  if (isDesktop === null) return null;
  return isDesktop === (on === "desktop") ? <>{children}</> : null;
}

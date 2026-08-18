"use client";

import type { ReactNode } from "react";

import { clearAppCache } from "@/components/pwa/clear-app-cache";

/**
 * Formulár na odhlásenie, ktorý pred odoslaním vyprázdni cache service workera.
 *
 * Existuje ako klientsky komponent preto, že `signOutAction` je serverová akcia
 * a na service worker nedosiahne — správu mu musí poslať prehliadač. Bez toho
 * by po odhlásení ostali v cache vykreslené stránky s úlohami: `sw.js` odkladá
 * navigácie a nikto ich nikdy nečistil.
 *
 * Odosielaniu sa nebráni. Keď upratovanie zlyhá alebo prehliadač service
 * workery nepozná, odhlásenie prebehne tak či tak.
 */
export function SignOutForm({ action, children }: {
  action: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <form action={action} onSubmit={clearAppCache}>
      {children}
    </form>
  );
}

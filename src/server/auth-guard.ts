import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { parseSettings, type Settings } from "@/lib/settings";

/**
 * Prihlásený používateľ tak, ako ho vidí serverová vrstva.
 * `settings` sú vždy doplnené o defaulty — chýbajúce polia nikdy nevybuchnú.
 */
export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  settings: Settings;
}

/**
 * Používateľ overený inak než cookie — tokenom MCP klienta (`/api/mcp`).
 *
 * MCP nástroje volajú tie isté serverové akcie ako obrazovky appky, aby
 * platili tie isté pravidlá (strážca odkladov, priorita dňa, história
 * úlohy). Akcie si používateľa berú z `requireUser()` — a ten ho vďaka
 * tomuto úložisku nájde aj bez session. Úložisko je viazané na jednu
 * požiadavku; mimo `runAsUser` je vždy prázdne.
 */
const tokenUser = new AsyncLocalStorage<CurrentUser>();

/** Spustí `fn` ako daný používateľ. Volá ho len `/api/mcp` po overení tokenu. */
export function runAsUser<T>(user: CurrentUser, fn: () => Promise<T>): Promise<T> {
  return tokenUser.run(user, fn);
}

/** Používateľ podľa id — pre požiadavky overené tokenom namiesto session. */
export async function loadUser(userId: string): Promise<CurrentUser | null> {
  const db = await getDb();
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    settings: parseSettings(row.settings),
  };
}

/**
 * Vráti prihláseného používateľa, alebo `null`, ak nikto prihlásený nie je.
 * Nepresmerováva — hodí sa pre verejné stránky a layouty, ktoré si stav riešia samy.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const fromToken = tokenUser.getStore();
  if (fromToken !== undefined) return fromToken;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  // Session môže prežiť zmazanie riadka v `users` — vtedy sa tvárime ako neprihlásení.
  return loadUser(userId);
}

/**
 * To isté, ale bez prihlásenia sa nedá pokračovať — presmeruje na /prihlasenie.
 * `redirect()` vyhadzuje výnimku, takže návratový typ je bezpečne non-null.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/prihlasenie");
  return user;
}

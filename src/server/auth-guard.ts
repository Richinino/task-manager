import "server-only";

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
 * Vráti prihláseného používateľa, alebo `null`, ak nikto prihlásený nie je.
 * Nepresmerováva — hodí sa pre verejné stránky a layouty, ktoré si stav riešia samy.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const db = await getDb();
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  // Session môže prežiť zmazanie riadka v `users` — vtedy sa tvárime ako neprihlásení.
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    settings: parseSettings(row.settings),
  };
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

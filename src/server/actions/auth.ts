"use server";

import { signOut } from "@/auth";

/**
 * Odhlásenie z obrazoviek, ktoré ho ponúkajú mimo `AppShell` (Knižnica na
 * telefóne). Layout má vlastnú inline kópiu pre bočný panel.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/prihlasenie" });
}

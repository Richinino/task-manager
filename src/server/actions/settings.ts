"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { type Settings, settingsInputSchema } from "@/lib/settings";
import { requireUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝSLEDOK AKCIE

   Spoločný tvar žije v `@/server/action-result`.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";

import type { ActionResult } from "@/server/action-result";

/**
 * Cesty, ktoré nastavenia ovplyvňujú.
 *
 * Prakticky všetko: pásmo mení, ktorý deň je „dnes", prahy odkladov menia
 * farby odznakov, WIP limit hlášku na „Dnes", hodiny dňa rozpočet času
 * a prahy nápadov ich fázy. Lacnejšie je zneplatniť všetko než sa mýliť.
 */
const AFFECTED_PATHS = [
  "/dnes",
  "/tyzden",
  "/mesiac",
  "/inbox",
  "/niekedy",
  "/caka-sa-na",
  "/projekty",
  "/oblasti",
  "/napady",
  "/nastavenia",
] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/settings] ${message}`, error);
  return { ok: false, error: message };
}

/**
 * Uloží nastavenia.
 *
 * `patch` sa zlučuje nad **aktuálne** nastavenia, nie nad predvolené — inak by
 * uloženie jedného poľa ticho prepísalo všetky ostatné na defaulty. Zapisuje sa
 * vždy celý objekt, lebo `users.settings` je jeden jsonb stĺpec.
 *
 * Overuje `settingsInputSchema`, ktorá má navyše krížové kontroly (koniec dňa
 * po jeho začiatku, prah blokovania nad prahom upozornenia, vyblednutie po
 * inkubátore, existujúce časové pásmo). Tie zámerne nie sú v schéme, ktorou sa
 * nastavenia čítajú — podrobnosti v `src/lib/settings.ts`.
 */
export async function updateSettings(
  patch: Partial<Settings>,
): Promise<ActionResult<Settings>> {
  const user = await requireUser();
  try {
    const merged = { ...user.settings, ...patch };

    const parsed = settingsInputSchema.safeParse(merged);
    if (!parsed.success) return invalid(parsed.error, "Nastavenia sa nepodarilo uložiť.");
    const settings = parsed.data;

    const db = await getDb();
    await db.update(users).set({ settings }).where(eq(users.id, user.id));

    revalidateViews();
    return { ok: true, data: settings };
  } catch (error) {
    return fail(error, "Nastavenia sa nepodarilo uložiť.");
  }
}

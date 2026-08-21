"use server";

import { revalidatePath } from "next/cache";

import { signIn } from "@/auth";
import { CALENDAR_SCOPE_REQUEST } from "@/lib/google-scopes";
import { requireUser } from "@/server/auth-guard";
import { disconnectCalendar as forgetCalendar } from "@/server/google-tokens";

/* ═══════════════════════════════════════════════════════════════════════════
   PREPOJENIE S GOOGLE KALENDÁROM

   Kalendár je doplnok, nie podmienka vstupu. Prihlásenie preto pýta len
   identitu a o kalendár sa človek prihlási sám, odtiaľto.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Pošle používateľa ku Googlu po súhlas s čítaním kalendára.
 *
 * Ide to cez ten **istý** poskytovateľ `google` ako bežné prihlásenie, len
 * s inými parametrami autorizácie — tretí argument `signIn`. Vďaka tomu sa
 * použije aj tá istá callback adresa a v Google Console netreba pridávať nič.
 *
 * `access_type: "offline"` kvôli refresh tokenu (bez neho by prístup vypršal
 * o hodinu) a `prompt: "consent"`, lebo Google refresh token pošle **iba pri
 * skutočnom súhlase** — bez toho by sa pri druhom pokuse vrátil prázdny.
 * `include_granted_scopes` udrží už udelené oprávnenia, aby sa prihlásenie
 * nezúžilo len na kalendár.
 */
export async function connectCalendar(): Promise<void> {
  await requireUser();
  await signIn(
    "google",
    { redirectTo: "/nastavenia" },
    {
      scope: CALENDAR_SCOPE_REQUEST,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  );
}

/** Odvolá súhlas u Googlu a zabudne uložené tokeny. */
export async function disconnectCalendar(): Promise<void> {
  const user = await requireUser();
  await forgetCalendar(user.id);

  // Porady z kalendára sa kreslia na „Dnes" — bez tohto by tam ostali visieť
  // až do ďalšieho načítania.
  revalidatePath("/nastavenia");
  revalidatePath("/dnes");
}

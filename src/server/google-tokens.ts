import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { accounts } from "@/db/schema";

/* ═══════════════════════════════════════════════════════════════════════════
   GOOGLE TOKENY

   Refresh token je dlhodobé poverenie k cudziemu účtu. Do JWT nepatrí —
   cookie je to posledné miesto, kam by som ho dal. Ukladá sa do `accounts`,
   ktorá naň čaká od M0.

   Obnova je lenivá: prístupový token platí hodinu a obnovuje sa až vtedy,
   keď je potrebný a už vypršal. Žiadny cron, rovnako ako všade v appke.
   ═══════════════════════════════════════════════════════════════════════════ */

const PROVIDER = "google";

/**
 * Rezerva pred vypršaním.
 *
 * Token platný ešte 30 sekúnd je v praxi neplatný — kým požiadavka doletí ku
 * Googlu, môže byť po ňom. Minúta je dosť na cestu po sieti a málo na to, aby
 * sa obnovovalo zbytočne často.
 */
const EXPIRY_SKEW_MS = 60_000;

export interface StoredAccount {
  providerAccountId: string;
  access_token?: string | undefined;
  refresh_token?: string | undefined;
  /** Sekundy od epochy, ako ich posiela Google. */
  expires_at?: number | undefined;
  scope?: string | undefined;
}

/**
 * Uloží tokeny po prihlásení. Volá sa z callbacku `jwt` v `auth.ts`.
 *
 * **Refresh token príde iba pri PRVOM súhlase.** Pri ďalších prihláseniach ho
 * Google neposiela, takže sa nesmie prepísať na `null` — inak by druhé
 * prihlásenie kalendár ticho odpojilo. Prepisuje sa iba vtedy, keď naozaj
 * prišiel nový.
 */
export async function storeGoogleAccount(
  userId: string,
  account: StoredAccount,
): Promise<void> {
  const db = await getDb();

  const expiresAt =
    account.expires_at === undefined ? null : new Date(account.expires_at * 1000);

  const existing = await db
    .select({ providerAccountId: accounts.providerAccountId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, PROVIDER),
        eq(accounts.providerAccountId, account.providerAccountId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(accounts)
      .set({
        userId,
        accessToken: account.access_token ?? null,
        expiresAt,
        scope: account.scope ?? null,
        // Iba keď naozaj prišiel — pozri komentár vyššie.
        ...(account.refresh_token ? { refreshToken: account.refresh_token } : {}),
      })
      .where(
        and(
          eq(accounts.provider, PROVIDER),
          eq(accounts.providerAccountId, account.providerAccountId),
        ),
      );
    return;
  }

  await db.insert(accounts).values({
    userId,
    provider: PROVIDER,
    providerAccountId: account.providerAccountId,
    accessToken: account.access_token ?? null,
    refreshToken: account.refresh_token ?? null,
    expiresAt,
    scope: account.scope ?? null,
  });
}

/** Odpojí kalendár — súhlas bol odvolaný alebo obnova trvalo zlyhala. */
async function forgetRefreshToken(userId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(accounts)
    .set({ refreshToken: null, accessToken: null, expiresAt: null })
    .where(and(eq(accounts.provider, PROVIDER), eq(accounts.userId, userId)));
}

interface RefreshResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

/**
 * Platný prístupový token, v prípade potreby obnovený.
 *
 * `null` znamená „kalendár nie je k dispozícii" — používateľ ho nepripojil,
 * odvolal súhlas alebo obnova zlyhala. Volajúci sa v takom prípade zaobíde
 * bez kalendára; nikdy sa to neprejaví ako chyba obrazovky.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        accessToken: accounts.accessToken,
        refreshToken: accounts.refreshToken,
        expiresAt: accounts.expiresAt,
      })
      .from(accounts)
      .where(and(eq(accounts.provider, PROVIDER), eq(accounts.userId, userId)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const stillValid =
      row.accessToken !== null &&
      row.expiresAt !== null &&
      row.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
    if (stillValid) return row.accessToken;

    if (row.refreshToken === null) return null;

    const clientId = process.env["AUTH_GOOGLE_ID"];
    const clientSecret = process.env["AUTH_GOOGLE_SECRET"];
    if (!clientId || !clientSecret) return null;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: row.refreshToken,
      }),
      // Bez cache: token je jednorazový a odpoveď sa nesmie nikde odložiť.
      cache: "no-store",
    });

    const data = (await response.json()) as RefreshResponse;

    /*
      `invalid_grant` znamená, že súhlas bol odvolaný alebo refresh token
      vypršal. Skúšať to znova pri každom načítaní stránky by len spomaľovalo,
      takže token zabudneme a appka sa odteraz tvári, že kalendár pripojený nie
      je. Späť ho vráti nové prihlásenie.
    */
    if (!response.ok || data.access_token === undefined) {
      if (data.error === "invalid_grant") await forgetRefreshToken(userId);
      console.error("[google-tokens] Obnova tokenu zlyhala:", data.error ?? response.status);
      return null;
    }

    const expiresIn = data.expires_in ?? 3600;
    const newExpiry = new Date(Date.now() + expiresIn * 1000);

    await db
      .update(accounts)
      .set({ accessToken: data.access_token, expiresAt: newExpiry })
      .where(and(eq(accounts.provider, PROVIDER), eq(accounts.userId, userId)));

    return data.access_token;
  } catch (error) {
    // Kalendár je doplnok — jeho zlyhanie nesmie zhodiť obrazovku.
    console.error("[google-tokens] Prístupový token sa nepodarilo získať:", error);
    return null;
  }
}

/** Má používateľ kalendár vôbec pripojený? Pre rozhranie, bez volania Googlu. */
export async function hasCalendarAccess(userId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = await db
      .select({ refreshToken: accounts.refreshToken, scope: accounts.scope })
      .from(accounts)
      .where(and(eq(accounts.provider, PROVIDER), eq(accounts.userId, userId)))
      .limit(1);

    const row = rows[0];
    if (!row || row.refreshToken === null) return false;
    return (row.scope ?? "").includes("calendar.readonly");
  } catch {
    return false;
  }
}

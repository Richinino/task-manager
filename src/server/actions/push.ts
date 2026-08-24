"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/server/auth-guard";
import type { ActionResult } from "@/server/action-result";

/**
 * Prihlásenie a odhlásenie zariadenia z notifikácií.
 *
 * Riadok je na **prehliadač**, nie na človeka — kľúčom je `endpoint`, ktorý
 * vydá push služba. Ten istý človek má bežne tri: telefón, notebook, prácu.
 *
 * Prihlásenie sa dá zopakovať: prehliadač endpoint občas obnoví a pošle ten
 * istý znova. Preto `onConflictDoUpdate` — kľúče sa prepíšu a `lastSeenAt`
 * sa posunie, nič sa nezduplikuje.
 */

/**
 * Tvar, ktorý vydá `PushSubscription.toJSON()`.
 *
 * Kontroluje sa naozaj: prichádza to z prehliadača, teda spoza hranice
 * dôvery. Endpoint musí byť HTTPS adresa — bez toho by sa doň dalo zapísať
 * čokoľvek a plánovač by na to potom posielal požiadavky.
 */
const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "Adresa prihlásenia musí byť HTTPS."),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(300),
    auth: z.string().trim().min(1).max(300),
  }),
});

export type PushSubscriptionInput = z.infer<typeof subscriptionSchema>;

/** Zapíše alebo obnoví prihlásenie tohto prehliadača. */
export async function savePushSubscription(
  input: unknown,
  userAgent?: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Prihlásenie na notifikácie sa nepodarilo prečítať." };
  }

  const db = await getDb();
  const { endpoint, keys } = parsed.data;

  await db
    .insert(pushSubscriptions)
    .values({
      endpoint,
      userId: user.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        /*
          Aj `userId` — endpoint môže po preinštalovaní pripadnúť druhému
          človeku na tom istom zariadení. Bez tohto by mu chodili cudzie
          pripomienky.
        */
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
        lastSeenAt: new Date(),
      },
    });

  return { ok: true };
}

/** Odhlási tento prehliadač. Cudzí riadok sa zmazať nedá. */
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();

  const trimmed = endpoint.trim();
  if (trimmed === "") return { ok: false, error: "Chýba adresa prihlásenia." };

  const db = await getDb();
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, trimmed),
        eq(pushSubscriptions.userId, user.id),
      ),
    );

  return { ok: true };
}

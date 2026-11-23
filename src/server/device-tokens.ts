import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { deviceTokens } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { hashSecret, newSecret } from "@/lib/oauth";

/*
  Tokeny zariadení (widget v telefóne). Ukladá sa len odtlačok; čistý token
  vidí človek raz — pri párovaní. Rovnaký vzor ako `verifyAccessToken`.
*/

const PREFIX = "tm_dt_";
const TOUCH_MS = 5 * 60 * 1000;

export async function createDeviceToken(userId: string, name: string): Promise<string> {
  const token = newSecret("tm_dt");
  const db = await getDb();
  await db.insert(deviceTokens).values({
    id: uuidv7(),
    userId,
    name,
    tokenHash: hashSecret(token),
  });
  return token;
}

/** Používateľ podľa tokenu, alebo `null` (cudzí tvar, neznámy, zrušený). */
export async function verifyDeviceToken(token: string): Promise<string | null> {
  if (!token.startsWith(PREFIX) || token.length > 200) return null;
  const db = await getDb();
  const now = new Date();
  // Token sám určuje používateľa — filtruje sa jeho odtlačkom.
  // bez-filtra: hľadá sa podľa odtlačku tokenu, userId z neho ešte len vzniká.
  const rows = await db
    .select({
      id: deviceTokens.id,
      userId: deviceTokens.userId,
      lastUsedAt: deviceTokens.lastUsedAt,
    })
    .from(deviceTokens)
    .where(and(eq(deviceTokens.tokenHash, hashSecret(token)), isNull(deviceTokens.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;

  if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() > TOUCH_MS) {
    await db
      .update(deviceTokens)
      .set({ lastUsedAt: now })
      .where(and(eq(deviceTokens.id, row.id), eq(deviceTokens.userId, row.userId)));
  }
  return row.userId;
}

export interface DeviceTokenRow {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function listDeviceTokens(userId: string): Promise<DeviceTokenRow[]> {
  const db = await getDb();
  return db
    .select({
      id: deviceTokens.id,
      name: deviceTokens.name,
      createdAt: deviceTokens.createdAt,
      lastUsedAt: deviceTokens.lastUsedAt,
    })
    .from(deviceTokens)
    .where(and(eq(deviceTokens.userId, userId), isNull(deviceTokens.revokedAt)))
    .orderBy(desc(deviceTokens.createdAt));
}

export async function revokeDeviceToken(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(deviceTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(deviceTokens.id, id), eq(deviceTokens.userId, userId), isNull(deviceTokens.revokedAt)),
    )
    .returning();
  return updated.length > 0;
}

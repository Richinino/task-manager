import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/db";
import { focusSessions } from "@/db/schema";
import type { FocusEndReason } from "@/lib/focus";

/**
 * Ukončí bežiaci fokus tejto úlohy, ak nejaký je. Vráti, či nejaký skončil.
 *
 * Volá sa v tej istej transakcii, v ktorej úloha zmení stav (hotovo,
 * zahodená, zmazaná) — inak by lišta fokusu ostala visieť nad úlohou, ktorej
 * sa už nikto nemá venovať. Žije v samostatnom module, aby ju vedeli použiť
 * aj MCP a API cesty, nie len akcie z rozhrania.
 */
export async function endFocusForTask(
  tx: Pick<Database, "update">,
  userId: string,
  taskId: string,
  reason: FocusEndReason,
): Promise<boolean> {
  const ended = await tx
    .update(focusSessions)
    .set({ endedAt: new Date(), endReason: reason })
    .where(
      and(
        eq(focusSessions.userId, userId),
        eq(focusSessions.taskId, taskId),
        isNull(focusSessions.endedAt),
      ),
    )
    .returning();
  return ended.length > 0;
}

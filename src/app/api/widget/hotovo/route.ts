import { z } from "zod";

import { runAsUser } from "@/server/auth-guard";
import { toggleTaskDone } from "@/server/actions/tasks";
import { getTasksByIds } from "@/server/queries/tasks";

import { NO_STORE, unauthorized, widgetUser } from "../_auth";

/* Odškrtnutie úlohy z widgetu. Idempotentné: hotová úloha ostáva hotová. */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ taskId: z.string().min(1).max(64) });

export async function POST(request: Request): Promise<Response> {
  const user = await widgetUser(request);
  if (user === null) return unauthorized();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Chýba taskId." }, { status: 400, headers: NO_STORE });
  }
  const { taskId } = parsed.data;

  return runAsUser(user, async () => {
    const [task] = await getTasksByIds(user.id, [taskId]);
    if (task === undefined) {
      return Response.json({ error: "Úloha sa nenašla." }, { status: 404, headers: NO_STORE });
    }
    if (task.status !== "done") {
      const result = await toggleTaskDone(taskId);
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 422, headers: NO_STORE });
      }
    }
    return Response.json({ ok: true }, { headers: NO_STORE });
  });
}

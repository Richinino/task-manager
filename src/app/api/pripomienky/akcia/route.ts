import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { focusSessions, tasks } from "@/db/schema";
import { minutesIn, todayIn } from "@/lib/dates";
import { extendFocus, finishFocus } from "@/server/actions/focus";
import { rescheduleTask, toggleTaskDone, updateTask } from "@/server/actions/tasks";
import { getCurrentUser } from "@/server/auth-guard";

/**
 * Tlačidlá pod notifikáciou — „Hotovo" a „O hodinu".
 *
 * Volá ich service worker (`public/sw.js`) po ťuknutí na tlačidlo. Ide s
 * cookie relácie, takže serverové akcie (`requireUser`) fungujú rovnako ako
 * z obrazovky. Bez relácie vráti 401 a worker otvorí appku ako pri bežnom
 * ťuknutí.
 *
 * „+15 min" a „Hotovo" z notifikácie o vypršanom fokuse (`fokus-plus`,
 * `fokus-hotovo`) volajú tie isté akcie ako tlačidlá na obrazovke fokusu.
 *
 * „O hodinu" presunie úlohu na dnes o 60 minút neskôr. Pripomienky sú
 * jedinečné na (úloha, okamih), takže nový čas sám vyrobí novú pripomienku.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  taskId: z.string().min(1).max(100),
  akcia: z.enum(["hotovo", "odlozit", "fokus-plus", "fokus-hotovo"]),
});

const NO_STORE = { "Cache-Control": "no-store" };

function chyba(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status, headers: NO_STORE });
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null) return chyba("Nie si prihlásený.", 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return chyba("Neplatná požiadavka.", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return chyba("Neplatná požiadavka.", 400);
  const { taskId, akcia } = parsed.data;

  const db = await getDb();
  const [uloha] = await db
    .select({ id: tasks.id, status: tasks.status, plannedDate: tasks.plannedDate })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
    .limit(1);
  if (!uloha) return chyba("Úloha sa nenašla.", 404);

  if (akcia === "fokus-plus" || akcia === "fokus-hotovo") {
    /*
      Tlačidlo patrí konkrétnej úlohe. Keď medzitým beží fokus na inej
      (alebo žiadny), „+15 min" nesmie predĺžiť cudzí úsek — vrátime 409 a
      service worker otvorí appku, kde človek uvidí skutočný stav.
    */
    const [beziaci] = await db
      .select({ taskId: focusSessions.taskId })
      .from(focusSessions)
      .where(and(eq(focusSessions.userId, user.id), isNull(focusSessions.endedAt)))
      .limit(1);
    const beziNaTejtoUlohe = beziaci?.taskId === taskId;

    if (akcia === "fokus-plus") {
      if (!beziNaTejtoUlohe) return chyba("Fokus na tejto úlohe už nebeží.", 409);
      const result = await extendFocus();
      if (!result.ok) return chyba(result.error, 422);
      return Response.json({ ok: true }, { headers: NO_STORE });
    }

    if (beziNaTejtoUlohe) {
      const result = await finishFocus({ complete: true });
      if (!result.ok) return chyba(result.error, 422);
    } else if (uloha.status !== "done") {
      // Fokus už skončil (napr. pauza), ale úloha ešte nie je hotová.
      const result = await toggleTaskDone(taskId);
      if (!result.ok) return chyba(result.error, 422);
    }
    return Response.json({ ok: true }, { headers: NO_STORE });
  }

  if (akcia === "hotovo") {
    // Už hotovú úlohu nevraciame späť — druhé ťuknutie nemá nič prepnúť.
    if (uloha.status !== "done") {
      const result = await toggleTaskDone(taskId);
      if (!result.ok) return chyba(result.error, 422);
    }
    return Response.json({ ok: true }, { headers: NO_STORE });
  }

  const tz = user.settings.timezone;
  const dnes = todayIn(tz);
  // Strop 23:59 — hodina po polnoci by úlohu poslala na zajtrajšok bez dátumu.
  const cas = hhmm(Math.min(minutesIn(tz) + 60, 23 * 60 + 59));

  if (uloha.plannedDate !== dnes) {
    const presun = await rescheduleTask(taskId, dnes);
    if (!presun.ok) return chyba(presun.error, 422);
  }
  const zmena = await updateTask(taskId, { plannedTime: cas });
  if (!zmena.ok) return chyba(zmena.error, 422);

  return Response.json({ ok: true }, { headers: NO_STORE });
}

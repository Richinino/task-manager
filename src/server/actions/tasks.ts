"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/db";
import {
  areas,
  projects,
  taskEvents,
  tasks,
  type Horizon,
  type Task,
  type TaskEvent,
  type TaskStatus,
} from "@/db/schema";
import { addDays, todayIn } from "@/lib/dates";
import { uuidv7 } from "@/lib/id";
import { parseCapture } from "@/lib/parse";
import { requireUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝSLEDOK AKCIE

   Akcia nikdy nevyhodí výnimku ku klientovi. Buď sa podarí, alebo vráti
   slovenskú hlášku, ktorú vie UI rovno zobraziť.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? {} : { data: T }))
  | { ok: false; error: string };

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDÁCIA
   ═══════════════════════════════════════════════════════════════════════════ */

const idSchema = z.string().min(1, "Chýba identifikátor úlohy.");
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.");
const isoTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Čas musí byť v tvare HH:MM.");

const titleSchema = z
  .string()
  .trim()
  .min(1, "Úloha musí mať názov.")
  .max(500, "Názov úlohy je príliš dlhý.");
const noteSchema = z.string().max(10_000, "Poznámka je príliš dlhá.");
const contextSchema = z.string().trim().max(64, "Kontext je príliš dlhý.");
const statusSchema = z.enum([
  "inbox",
  "todo",
  "doing",
  "waiting",
  "done",
  "dropped",
]);
const horizonSchema = z.enum(["day", "week", "month", "someday"]);
const energySchema = z.enum(["low", "mid", "high"]);
const prioritySchema = z
  .number()
  .int("Priorita musí byť celé číslo.")
  .min(1, "Priorita je 1 až 3.")
  .max(3, "Priorita je 1 až 3.");
const estimateSchema = z
  .number()
  .int("Odhad musí byť celé číslo minút.")
  .min(1, "Odhad musí byť aspoň 1 minúta.")
  .max(1440, "Odhad je najviac 24 hodín.");

/** Spoločné polia pre vytvorenie aj úpravu. */
const taskFieldsSchema = z.object({
  note: noteSchema.nullish(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  dueDate: isoDateSchema.nullish(),
  dueTime: isoTimeSchema.nullish(),
  plannedDate: isoDateSchema.nullish(),
  plannedTime: isoTimeSchema.nullish(),
  horizon: horizonSchema.optional(),
  estimateMin: estimateSchema.nullish(),
  energy: energySchema.nullish(),
  context: contextSchema.nullish(),
  projectId: idSchema.nullish(),
  areaId: idSchema.nullish(),
  parentTaskId: idSchema.nullish(),
});

const createTaskSchema = taskFieldsSchema.extend({ title: titleSchema });

const updateTaskSchema = taskFieldsSchema.extend({
  title: titleSchema.optional(),
  sort: z.number().int("Poradie musí byť celé číslo.").optional(),
});

/**
 * Vstup pre `createTask`. Chýbajúce polia sa doplnia rozumnými defaultmi:
 * priorita 3, stav podľa toho, či je úloha naplánovaná, horizont podľa dátumu.
 * Žaba sa nedá nastaviť pri vytvorení — je na to `setFrog`.
 */
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Vstup pre `updateTask`. Rozlišuje sa „pole neprišlo" (`undefined` → nemení sa)
 * a „vyprázdni pole" (`null` → zapíše sa NULL).
 */
export type UpdateTaskPatch = z.infer<typeof updateTaskSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

/** Obrazovky, ktoré ktorákoľvek zmena úlohy môže ovplyvniť. */
const AFFECTED_PATHS = ["/dnes", "/tyzden", "/mesiac", "/inbox"] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

/** Výnimka sa nikdy nedostane ku klientovi — zaloguje sa a nahradí hláškou. */
function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/tasks] ${message}`, error);
  return { ok: false, error: message };
}

async function loadTask(
  db: Database,
  userId: string,
  id: string,
): Promise<Task | undefined> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .limit(1);
  return rows[0];
}

/**
 * Cudzie kľúče musia patriť tomu istému používateľovi — inak by sa dalo
 * odkazom priviazať cudzí projekt či oblasť.
 */
async function checkRefs(
  db: Database,
  userId: string,
  refs: {
    projectId?: string | null;
    areaId?: string | null;
    parentTaskId?: string | null;
  },
): Promise<string | null> {
  if (refs.projectId) {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, refs.projectId),
          eq(projects.userId, userId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!rows[0]) return "Projekt sa nenašiel.";
  }

  if (refs.areaId) {
    const rows = await db
      .select({ id: areas.id })
      .from(areas)
      .where(
        and(
          eq(areas.id, refs.areaId),
          eq(areas.userId, userId),
          isNull(areas.deletedAt),
        ),
      )
      .limit(1);
    if (!rows[0]) return "Oblasť sa nenašla.";
  }

  if (refs.parentTaskId) {
    const parent = await loadTask(db, userId, refs.parentTaskId);
    if (!parent) return "Nadradená úloha sa nenašla.";
  }

  return null;
}

/**
 * Na ktorý horizont dátum patrí.
 * dnes/zajtra → deň · do 7 dní → týždeň · do konca mesiaca → mesiac · inak niekedy.
 */
function horizonForDate(date: string, todayIso: string): Horizon {
  if (date <= addDays(todayIso, 1)) return "day";
  if (date <= addDays(todayIso, 7)) return "week";
  if (date.slice(0, 7) === todayIso.slice(0, 7)) return "month";
  return "someday";
}

/** Výstup parsera je len návrh — čo neprejde validáciou, ticho zahodíme. */
function sanitize<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value === undefined || value === null) return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   AKCIE

   Poradie v každej: requireUser → validácia → zápis → task_events →
   revalidatePath → ActionResult. `requireUser()` je zámerne mimo try/catch,
   aby presmerovanie z `redirect()` neskončilo v catch bloku.
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createTask(
  input: CreateTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const parsed = createTaskSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje úlohy.");
    const data = parsed.data;

    const db = await getDb();
    const refError = await checkRefs(db, user.id, data);
    if (refError) return { ok: false, error: refError };

    const plannedDate = data.plannedDate ?? null;
    // Bez dňa aj bez projektu úloha ešte nie je spracovaná — patrí do inboxu.
    const isPlaced = plannedDate !== null || (data.projectId ?? null) !== null;
    const status: TaskStatus = data.status ?? (isPlaced ? "todo" : "inbox");
    const horizon: Horizon =
      data.horizon ?? (plannedDate ? horizonForDate(plannedDate, todayIn(user.settings.timezone)) : "week");

    const id = uuidv7();
    await db.insert(tasks).values({
      id,
      userId: user.id,
      title: data.title,
      note: data.note ?? null,
      status,
      priority: data.priority ?? 3,
      dueDate: data.dueDate ?? null,
      dueTime: data.dueTime ?? null,
      plannedDate,
      plannedTime: data.plannedTime ?? null,
      horizon,
      estimateMin: data.estimateMin ?? null,
      energy: data.energy ?? null,
      context: data.context ?? null,
      projectId: data.projectId ?? null,
      areaId: data.areaId ?? null,
      parentTaskId: data.parentTaskId ?? null,
      completedAt: status === "done" ? new Date() : null,
    });

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: id,
      type: "created",
      toValue: data.title,
    });

    revalidateViews();
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Úlohu sa nepodarilo vytvoriť.");
  }
}

/**
 * Rýchle zachytenie z jedného riadka. Text rozoberie `parseCapture`.
 *
 * `forceInbox` znamená „nič neplánuj, len to odlož do inboxu" — naplánovaný
 * deň a čas sa v tom prípade ignorujú, termín (`dueDate`) ostáva, lebo to je
 * fakt, nie plán.
 */
export async function quickCapture(
  raw: string,
  opts?: { forceInbox?: boolean },
): Promise<ActionResult<{ id: string; title: string }>> {
  const user = await requireUser();
  try {
    const rawParsed = z
      .string()
      .min(1, "Napíš, čo treba spraviť.")
      .max(2000, "Text je príliš dlhý.")
      .safeParse(raw);
    if (!rawParsed.success) return invalid(rawParsed.error, "Neplatný text.");

    /*
      Parser číta z `now` lokálne zložky dátumu. Keby sme mu podstrčili obyčajné
      `new Date()`, na Verceli (UTC) by „zajtra" počítal z iného dňa, než na akom
      používateľ reálne stojí. Postavíme mu preto poludnie JEHO dnešného dňa —
      poludnie preto, aby posun pásma nikdy nepreklopil dátum cez polnoc.
    */
    const todayIso = todayIn(user.settings.timezone);
    const [y, m, d] = todayIso.split("-").map(Number);
    const now =
      y !== undefined && m !== undefined && d !== undefined
        ? new Date(y, m - 1, d, 12, 0, 0, 0)
        : new Date();

    const parsed = parseCapture(rawParsed.data, {
      now,
      weekStartsOn: user.settings.weekStartsOn,
    });

    const title = parsed.title.trim();
    if (!title) return { ok: false, error: "Úloha musí mať názov." };

    const forceInbox = opts?.forceInbox === true;
    const db = await getDb();

    // Projekt sa priraďuje podľa názvu bez ohľadu na veľkosť písmen.
    // Nový projekt sa zámerne nezakladá — na to je samostatný krok.
    let projectId: string | null = null;
    const projectName = parsed.projectName?.trim();
    if (projectName) {
      const rows = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.userId, user.id),
            isNull(projects.deletedAt),
            sql`lower(${projects.name}) = lower(${projectName})`,
          ),
        )
        .limit(1);
      projectId = rows[0]?.id ?? null;
    }

    const plannedDate = forceInbox
      ? null
      : sanitize(isoDateSchema, parsed.plannedDate);
    const plannedTime = forceInbox
      ? null
      : sanitize(isoTimeSchema, parsed.plannedTime);

    const status: TaskStatus = plannedDate ? "todo" : "inbox";
    const horizon: Horizon = plannedDate
      ? horizonForDate(plannedDate, todayIn(user.settings.timezone))
      : "week";

    const id = uuidv7();
    await db.insert(tasks).values({
      id,
      userId: user.id,
      title: title.slice(0, 500),
      status,
      priority: sanitize(prioritySchema, parsed.priority) ?? 3,
      dueDate: sanitize(isoDateSchema, parsed.dueDate),
      dueTime: sanitize(isoTimeSchema, parsed.dueTime),
      plannedDate,
      plannedTime,
      horizon,
      estimateMin: sanitize(estimateSchema, parsed.estimateMin),
      energy: sanitize(energySchema, parsed.energy),
      context: sanitize(contextSchema, parsed.context),
      projectId,
    });

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: id,
      type: "created",
      toValue: title,
    });

    revalidateViews();
    return { ok: true, data: { id, title } };
  } catch (error) {
    return fail(error, "Úlohu sa nepodarilo zachytiť.");
  }
}

export async function updateTask(
  id: string,
  patch: UpdateTaskPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const parsed = updateTaskSchema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje úlohy.");
    const data = parsed.data;

    const db = await getDb();
    const task = await loadTask(db, user.id, id);
    if (!task) return { ok: false, error: "Úloha sa nenašla." };

    const refError = await checkRefs(db, user.id, data);
    if (refError) return { ok: false, error: refError };

    const values: Partial<typeof tasks.$inferInsert> = {};
    const changed: string[] = [];

    if (data.title !== undefined && data.title !== task.title) {
      values.title = data.title;
      changed.push("title");
    }
    if (data.note !== undefined && (data.note ?? null) !== task.note) {
      values.note = data.note ?? null;
      changed.push("note");
    }
    if (data.priority !== undefined && data.priority !== task.priority) {
      values.priority = data.priority;
      changed.push("priority");
    }
    if (data.dueDate !== undefined && (data.dueDate ?? null) !== task.dueDate) {
      values.dueDate = data.dueDate ?? null;
      changed.push("dueDate");
    }
    if (data.dueTime !== undefined && (data.dueTime ?? null) !== task.dueTime) {
      values.dueTime = data.dueTime ?? null;
      changed.push("dueTime");
    }
    if (
      data.plannedTime !== undefined &&
      (data.plannedTime ?? null) !== task.plannedTime
    ) {
      values.plannedTime = data.plannedTime ?? null;
      changed.push("plannedTime");
    }
    if (data.horizon !== undefined && data.horizon !== task.horizon) {
      values.horizon = data.horizon;
      changed.push("horizon");
    }
    if (
      data.estimateMin !== undefined &&
      (data.estimateMin ?? null) !== task.estimateMin
    ) {
      values.estimateMin = data.estimateMin ?? null;
      changed.push("estimateMin");
    }
    if (data.energy !== undefined && (data.energy ?? null) !== task.energy) {
      values.energy = data.energy ?? null;
      changed.push("energy");
    }
    if (data.context !== undefined && (data.context ?? null) !== task.context) {
      values.context = data.context ?? null;
      changed.push("context");
    }
    if (data.projectId !== undefined && (data.projectId ?? null) !== task.projectId) {
      values.projectId = data.projectId ?? null;
      changed.push("projectId");
    }
    if (data.areaId !== undefined && (data.areaId ?? null) !== task.areaId) {
      values.areaId = data.areaId ?? null;
      changed.push("areaId");
    }
    if (data.parentTaskId !== undefined) {
      const nextParent = data.parentTaskId ?? null;
      if (nextParent === task.id) {
        return { ok: false, error: "Úloha nemôže byť podúlohou samej seba." };
      }
      if (nextParent !== task.parentTaskId) {
        values.parentTaskId = nextParent;
        changed.push("parentTaskId");
      }
    }
    if (data.sort !== undefined && data.sort !== task.sort) {
      values.sort = data.sort;
      changed.push("sort");
    }

    // Presun dňa cez updateTask sa neráta ako odklad — od toho je rescheduleTask.
    let rescheduledFrom: string | null = null;
    let rescheduledTo: string | null = null;
    let didReschedule = false;
    if (data.plannedDate !== undefined) {
      const nextDate = data.plannedDate ?? null;
      if (nextDate !== task.plannedDate) {
        values.plannedDate = nextDate;
        rescheduledFrom = task.plannedDate;
        rescheduledTo = nextDate;
        didReschedule = true;
        if (data.horizon === undefined && nextDate) {
          values.horizon = horizonForDate(nextDate, todayIn(user.settings.timezone));
        }
      }
    }

    let statusEvent: TaskEvent["type"] | null = null;
    if (data.status !== undefined && data.status !== task.status) {
      values.status = data.status;
      if (data.status === "done") {
        values.completedAt = new Date();
        statusEvent = "completed";
      } else if (task.status === "done") {
        values.completedAt = null;
        statusEvent = "reopened";
      } else {
        statusEvent = "status_changed";
      }
    }

    if (changed.length === 0 && !didReschedule && statusEvent === null) {
      return { ok: true };
    }

    values.updatedAt = new Date();
    await db
      .update(tasks)
      .set(values)
      .where(and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)));

    const events: (typeof taskEvents.$inferInsert)[] = [];
    if (statusEvent) {
      events.push({
        id: uuidv7(),
        userId: user.id,
        taskId: id,
        type: statusEvent,
        fromValue: task.status,
        toValue: data.status ?? task.status,
      });
    }
    if (didReschedule) {
      events.push({
        id: uuidv7(),
        userId: user.id,
        taskId: id,
        type: "rescheduled",
        fromValue: rescheduledFrom,
        toValue: rescheduledTo,
      });
    }
    if (changed.length > 0) {
      events.push({
        id: uuidv7(),
        userId: user.id,
        taskId: id,
        type: "edited",
        toValue: changed.join(","),
      });
    }
    await db.insert(taskEvents).values(events);

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Úlohu sa nepodarilo upraviť.");
  }
}

export async function toggleTaskDone(
  id: string,
): Promise<ActionResult<{ done: boolean }>> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const db = await getDb();
    const task = await loadTask(db, user.id, id);
    if (!task) return { ok: false, error: "Úloha sa nenašla." };

    const wasDone = task.status === "done";
    // Odškrtnutá úloha sa vracia do „todo"; ak nemá deň ani projekt, patrí do inboxu.
    const isPlaced = task.plannedDate !== null || task.projectId !== null;
    const nextStatus: TaskStatus = wasDone ? (isPlaced ? "todo" : "inbox") : "done";

    await db
      .update(tasks)
      .set({
        status: nextStatus,
        completedAt: wasDone ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)));

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: id,
      type: wasDone ? "reopened" : "completed",
      fromValue: task.status,
      toValue: nextStatus,
    });

    revalidateViews();
    return { ok: true, data: { done: !wasDone } };
  } catch (error) {
    return fail(error, "Stav úlohy sa nepodarilo zmeniť.");
  }
}

/** Mäkké zmazanie — riadok ostáva, len dostane `deletedAt`. */
export async function deleteTask(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const db = await getDb();
    const task = await loadTask(db, user.id, id);
    if (!task) return { ok: false, error: "Úloha sa nenašla." };

    await db
      .update(tasks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)));

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: id,
      type: "deleted",
      fromValue: task.title,
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Úlohu sa nepodarilo zmazať.");
  }
}

/**
 * Vrátenie mäkko zmazanej úlohy. Jediné miesto, ktoré sa zámerne pozerá
 * na riadky s vyplneným `deletedAt` — inak by sa vrátiť nedali.
 */
export async function restoreTask(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const db = await getDb();
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.userId, user.id),
          isNotNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    if (!rows[0]) return { ok: false, error: "Zmazaná úloha sa nenašla." };

    await db
      .update(tasks)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)));

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: id,
      type: "edited",
      toValue: "restored",
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Úlohu sa nepodarilo obnoviť.");
  }
}

/**
 * Preplánovanie na iný deň (alebo zrušenie dátumu).
 *
 * Počítadlo odkladov stúpne **iba** ak úloha už deň mala, nový je neskorší
 * a úloha nie je uzavretá. Posun dopredu, zrušenie dátumu ani prvé
 * naplánovanie odklad nie sú.
 */
export async function rescheduleTask(
  id: string,
  plannedDate: string | null,
): Promise<ActionResult<{ postponeCount: number }>> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const dateParsed = isoDateSchema.nullable().safeParse(plannedDate);
    if (!dateParsed.success) {
      return invalid(dateParsed.error, "Dátum musí byť v tvare RRRR-MM-DD.");
    }
    const nextDate = dateParsed.data;

    const db = await getDb();
    const task = await loadTask(db, user.id, id);
    if (!task) return { ok: false, error: "Úloha sa nenašla." };

    const previousDate = task.plannedDate;
    if (previousDate === nextDate) {
      return { ok: true, data: { postponeCount: task.postponeCount } };
    }

    const isPostpone =
      previousDate !== null &&
      nextDate !== null &&
      nextDate > previousDate &&
      task.status !== "done" &&
      task.status !== "dropped";

    const postponeCount = task.postponeCount + (isPostpone ? 1 : 0);

    const values: Partial<typeof tasks.$inferInsert> = {
      plannedDate: nextDate,
      postponeCount,
      updatedAt: new Date(),
    };
    if (nextDate) values.horizon = horizonForDate(nextDate, todayIn(user.settings.timezone));
    // Žaba je záväzok konkrétneho dňa. Presunom na iný deň prestáva platiť —
    // žabu nového dňa si treba vybrať vedome.
    if (task.isFrog) values.isFrog = false;

    await db
      .update(tasks)
      .set(values)
      .where(and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)));

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: id,
      type: isPostpone ? "postponed" : "rescheduled",
      fromValue: previousDate,
      toValue: nextDate,
    });

    revalidateViews();
    return { ok: true, data: { postponeCount } };
  } catch (error) {
    return fail(error, "Úlohu sa nepodarilo preplánovať.");
  }
}

/**
 * Žaba dňa. Na jeden `plannedDate` smie byť žabou najviac jedna úloha —
 * zapnutie preto v tej istej transakcii zhasne všetky ostatné v ten deň.
 */
export async function setFrog(id: string, on: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const onParsed = z.boolean().safeParse(on);
    if (!onParsed.success) return invalid(onParsed.error, "Neplatná hodnota žaby.");
    const enable = onParsed.data;

    const db = await getDb();
    const task = await loadTask(db, user.id, id);
    if (!task) return { ok: false, error: "Úloha sa nenašla." };

    if (!enable) {
      if (!task.isFrog) return { ok: true };

      await db
        .update(tasks)
        .set({ isFrog: false, updatedAt: new Date() })
        .where(
          and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
        );
      await db.insert(taskEvents).values({
        id: uuidv7(),
        userId: user.id,
        taskId: id,
        type: "edited",
        toValue: "frog:off",
      });

      revalidateViews();
      return { ok: true };
    }

    const day = task.plannedDate;
    if (!day) {
      return { ok: false, error: "Žabou môže byť len úloha s naplánovaným dňom." };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ isFrog: false, updatedAt: new Date() })
        .where(
          and(
            eq(tasks.userId, user.id),
            eq(tasks.plannedDate, day),
            eq(tasks.isFrog, true),
            ne(tasks.id, id),
            isNull(tasks.deletedAt),
          ),
        );

      await tx
        .update(tasks)
        .set({ isFrog: true, updatedAt: new Date() })
        .where(
          and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
        );

      await tx.insert(taskEvents).values({
        id: uuidv7(),
        userId: user.id,
        taskId: id,
        type: "edited",
        toValue: "frog:on",
      });
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Žabu sa nepodarilo nastaviť.");
  }
}

/** Ručné poradie — `sort` dostane index z odovzdaného zoznamu. */
export async function reorderTasks(ids: string[]): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const parsed = z
      .array(idSchema)
      .min(1, "Zoznam úloh je prázdny.")
      .max(500, "Naraz sa dá preusporiadať najviac 500 úloh.")
      .safeParse(ids);
    if (!parsed.success) return invalid(parsed.error, "Neplatný zoznam úloh.");
    const order = parsed.data;

    if (new Set(order).size !== order.length) {
      return { ok: false, error: "Zoznam obsahuje tú istú úlohu viackrát." };
    }

    const db = await getDb();
    const current = await db
      .select({ id: tasks.id, sort: tasks.sort })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          isNull(tasks.deletedAt),
          inArray(tasks.id, order),
        ),
      );
    if (current.length !== order.length) {
      return { ok: false, error: "Niektoré úlohy sa nenašli." };
    }

    const currentSort = new Map(current.map((row) => [row.id, row.sort]));
    const updates = order
      .map((taskId, index) => ({ taskId, index }))
      .filter((update) => currentSort.get(update.taskId) !== update.index);
    if (updates.length === 0) return { ok: true };

    await db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(tasks)
          .set({ sort: update.index, updatedAt: new Date() })
          .where(
            and(
              eq(tasks.id, update.taskId),
              eq(tasks.userId, user.id),
              isNull(tasks.deletedAt),
            ),
          );
      }

      await tx.insert(taskEvents).values(
        updates.map((update) => ({
          id: uuidv7(),
          userId: user.id,
          taskId: update.taskId,
          type: "edited" as const,
          toValue: `sort:${update.index}`,
        })),
      );
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Poradie úloh sa nepodarilo uložiť.");
  }
}

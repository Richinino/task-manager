"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/db";
import { areas, ideas, projects, taggables, tags, tasks } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { requireUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝSLEDOK AKCIE

   Spoločný tvar žije v `@/server/action-result`. Re-export tu ostáva, aby
   existujúce importy z tohto modulu ďalej platili.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";
import type { ActionResult } from "@/server/action-result";

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDÁCIA
   ═══════════════════════════════════════════════════════════════════════════ */

const idSchema = z.string().min(1, "Chýba identifikátor.");
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.");

const MAX_TAG_LENGTH = 64;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Názov nesmie byť prázdny.")
  .max(200, "Názov je príliš dlhý.");

const textSchema = z.string().max(5000, "Text je príliš dlhý.");
const colorSchema = z.string().trim().min(1).max(40);
const iconSchema = z.string().trim().max(60);

const projectStatusSchema = z.enum(["active", "on_hold", "done", "dropped"]);

const createProjectSchema = z.object({
  name: nameSchema,
  goal: textSchema.nullish(),
  definitionOfDone: textSchema.nullish(),
  areaId: idSchema.nullish(),
  deadline: isoDateSchema.nullish(),
});

const updateProjectSchema = z.object({
  name: nameSchema.optional(),
  goal: textSchema.nullish(),
  definitionOfDone: textSchema.nullish(),
  areaId: idSchema.nullish(),
  deadline: isoDateSchema.nullish(),
  status: projectStatusSchema.optional(),
  sort: z.number().int("Poradie musí byť celé číslo.").optional(),
});

const createAreaSchema = z.object({
  name: nameSchema,
  color: colorSchema.optional(),
  icon: iconSchema.nullish(),
});

const updateAreaSchema = z.object({
  name: nameSchema.optional(),
  color: colorSchema.optional(),
  icon: iconSchema.nullish(),
  sort: z.number().int("Poradie musí byť celé číslo.").optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectPatch = z.infer<typeof updateProjectSchema>;
export type CreateAreaInput = z.infer<typeof createAreaSchema>;
export type UpdateAreaPatch = z.infer<typeof updateAreaSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Zmena štruktúry sa premietne do všetkých obrazoviek — úloha nesie oblasť
 * aj projekt v každom riadku, takže premenovanie musí byť vidieť všade.
 */
const AFFECTED_PATHS = [
  "/dnes",
  "/tyzden",
  "/mesiac",
  "/inbox",
  "/projekty",
  "/oblasti",
] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/structure] ${message}`, error);
  return { ok: false, error: message };
}

/** Prázdny reťazec znamená „vymazať hodnotu", nie „ulož prázdno". */
function orNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Dve oblasti s rovnakým názvom sú vždy omyl — v zozname sa nedajú rozlíšiť
 * a úloha priradená k „tej druhej Práci" pôsobí ako stratená.
 */
async function nameTaken(
  db: Database,
  table: typeof projects | typeof areas,
  userId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.userId, userId),
        isNull(table.deletedAt),
        sql`lower(${table.name}) = lower(${name})`,
      ),
    );
  return rows.some((row) => row.id !== exceptId);
}

/** Overí, že oblasť patrí používateľovi. `null` znamená „bez oblasti". */
async function checkArea(
  db: Database,
  userId: string,
  areaId: string | null | undefined,
): Promise<string | null> {
  if (!areaId) return null;
  const rows = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.userId, userId), isNull(areas.deletedAt)))
    .limit(1);
  return rows[0] ? null : "Oblasť sa nenašla.";
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROJEKTY
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createProject(
  input: CreateProjectInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const parsed = createProjectSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje projektu.");
    const data = parsed.data;

    const db = await getDb();

    const areaError = await checkArea(db, user.id, data.areaId);
    if (areaError) return { ok: false, error: areaError };

    if (await nameTaken(db, projects, user.id, data.name)) {
      return { ok: false, error: `Projekt „${data.name}“ už existuje.` };
    }

    const id = uuidv7();
    await db.insert(projects).values({
      id,
      userId: user.id,
      name: data.name,
      goal: orNull(data.goal) ?? null,
      definitionOfDone: orNull(data.definitionOfDone) ?? null,
      areaId: data.areaId ?? null,
      deadline: data.deadline ?? null,
    });

    revalidateViews();
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Projekt sa nepodarilo vytvoriť.");
  }
}

export async function updateProject(
  id: string,
  patch: UpdateProjectPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor projektu.");

    const parsed = updateProjectSchema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje projektu.");
    const data = parsed.data;

    const db = await getDb();

    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.userId, user.id),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!existing[0]) return { ok: false, error: "Projekt sa nenašiel." };

    if (data.areaId !== undefined) {
      const areaError = await checkArea(db, user.id, data.areaId);
      if (areaError) return { ok: false, error: areaError };
    }

    if (data.name !== undefined && (await nameTaken(db, projects, user.id, data.name, id))) {
      return { ok: false, error: `Projekt „${data.name}“ už existuje.` };
    }

    await db
      .update(projects)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.goal !== undefined ? { goal: orNull(data.goal) ?? null } : {}),
        ...(data.definitionOfDone !== undefined
          ? { definitionOfDone: orNull(data.definitionOfDone) ?? null }
          : {}),
        ...(data.areaId !== undefined ? { areaId: data.areaId ?? null } : {}),
        ...(data.deadline !== undefined ? { deadline: data.deadline ?? null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Projekt sa nepodarilo uložiť.");
  }
}

/**
 * Archivácia nie je mazanie: projekt sa prestane ponúkať vo výberoch, ale
 * jeho úlohy aj história ostávajú nedotknuté.
 */
export async function archiveProject(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor projektu.");

    const db = await getDb();

    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.userId, user.id),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!existing[0]) return { ok: false, error: "Projekt sa nenašiel." };

    await db
      .update(projects)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Projekt sa nepodarilo archivovať.");
  }
}

/**
 * Mäkké zmazanie projektu. Úlohy sa NEMAŽÚ — len sa od projektu odpoja.
 *
 * Databázové `onDelete: "set null"` sa tu neuplatní, lebo riadok fyzicky
 * ostáva; bez ručného odpojenia by úlohy visel na projekte, ktorý používateľ
 * už nikde nevidí, a v detaile by svietil prázdny výber.
 */
export async function deleteProject(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor projektu.");

    const db = await getDb();

    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.userId, user.id),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!existing[0]) return { ok: false, error: "Projekt sa nenašiel." };

    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ projectId: null, updatedAt: new Date() })
        .where(and(eq(tasks.userId, user.id), eq(tasks.projectId, id)));

      await tx
        .update(projects)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.userId, user.id)));
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Projekt sa nepodarilo zmazať.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   OBLASTI
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createArea(
  input: CreateAreaInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const parsed = createAreaSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje oblasti.");
    const data = parsed.data;

    const db = await getDb();

    if (await nameTaken(db, areas, user.id, data.name)) {
      return { ok: false, error: `Oblasť „${data.name}“ už existuje.` };
    }

    const sortRows = await db
      .select({ next: sql<number>`cast(coalesce(max(${areas.sort}), -1) + 1 as int)` })
      .from(areas)
      .where(and(eq(areas.userId, user.id), isNull(areas.deletedAt)));

    const id = uuidv7();
    await db.insert(areas).values({
      id,
      userId: user.id,
      name: data.name,
      ...(data.color !== undefined ? { color: data.color } : {}),
      icon: orNull(data.icon) ?? null,
      sort: Number(sortRows[0]?.next ?? 0),
    });

    revalidateViews();
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Oblasť sa nepodarilo vytvoriť.");
  }
}

export async function updateArea(
  id: string,
  patch: UpdateAreaPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor oblasti.");

    const parsed = updateAreaSchema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje oblasti.");
    const data = parsed.data;

    const db = await getDb();

    const existing = await db
      .select({ id: areas.id })
      .from(areas)
      .where(
        and(eq(areas.id, id), eq(areas.userId, user.id), isNull(areas.deletedAt)),
      )
      .limit(1);
    if (!existing[0]) return { ok: false, error: "Oblasť sa nenašla." };

    if (data.name !== undefined && (await nameTaken(db, areas, user.id, data.name, id))) {
      return { ok: false, error: `Oblasť „${data.name}“ už existuje.` };
    }

    await db
      .update(areas)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.icon !== undefined ? { icon: orNull(data.icon) ?? null } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(areas.id, id), eq(areas.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Oblasť sa nepodarilo uložiť.");
  }
}

export async function archiveArea(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor oblasti.");

    const db = await getDb();

    const existing = await db
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.id, id), eq(areas.userId, user.id), isNull(areas.deletedAt)))
      .limit(1);
    if (!existing[0]) return { ok: false, error: "Oblasť sa nenašla." };

    await db
      .update(areas)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(areas.id, id), eq(areas.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Oblasť sa nepodarilo archivovať.");
  }
}

/**
 * Mäkké zmazanie oblasti. Úlohy ani projekty sa nemažú — len sa od nej odpoja,
 * z rovnakého dôvodu ako pri projekte.
 */
export async function deleteArea(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor oblasti.");

    const db = await getDb();

    const existing = await db
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.id, id), eq(areas.userId, user.id), isNull(areas.deletedAt)))
      .limit(1);
    if (!existing[0]) return { ok: false, error: "Oblasť sa nenašla." };

    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ areaId: null, updatedAt: new Date() })
        .where(and(eq(tasks.userId, user.id), eq(tasks.areaId, id)));

      await tx
        .update(projects)
        .set({ areaId: null, updatedAt: new Date() })
        .where(and(eq(projects.userId, user.id), eq(projects.areaId, id)));

      /*
        Nápady sa odpájajú rovnako ako úlohy a projekty. Bez toho by
        `ideas.area_id` ukazoval na mäkko zmazaný riadok — `deletedAt` je
        len príznak, takže databázové `on delete set null` sa neuplatní.
        `lastTouchedAt` sa NEMENÍ: zmazanie oblasti nie je dotyk nápadu
        a nesmie mu resetovať hodiny zrenia.
      */
      await tx
        .update(ideas)
        .set({ areaId: null, updatedAt: new Date() })
        .where(and(eq(ideas.userId, user.id), eq(ideas.areaId, id)));

      await tx
        .update(areas)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(areas.id, id), eq(areas.userId, user.id)));
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Oblasť sa nepodarilo zmazať.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ŠTÍTKY
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Priradí úlohe štítok. Ak štítok s takým názvom ešte nie je, založí ho.
 *
 * Hľadanie je case-insensitive, aby `#Rodina` a `#rodina` neboli dva riadky.
 * Vkladá sa cez `onConflictDoNothing()` s opätovným dohľadaním — pri súbežnom
 * zápise by inak jeden z nich spadol na unikátnom indexe. Je to ten istý
 * postup, aký používa `quickCapture`, aby sa správanie nerozišlo.
 */
export async function attachTag(
  taskId: string,
  name: string,
): Promise<ActionResult<{ tagId: string }>> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(taskId);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const nameParsed = z
      .string()
      .trim()
      .min(1, "Štítok nesmie byť prázdny.")
      .max(MAX_TAG_LENGTH, "Štítok je príliš dlhý.")
      .safeParse(name.replace(/^#/u, ""));
    if (!nameParsed.success) return invalid(nameParsed.error, "Neplatný štítok.");
    const tagName = nameParsed.data;

    const db = await getDb();

    const task = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
      .limit(1);
    if (!task[0]) return { ok: false, error: "Úloha sa nenašla." };

    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(eq(tags.userId, user.id), sql`lower(${tags.name}) = lower(${tagName})`),
      )
      .limit(1);

    let tagId = existing[0]?.id;
    if (tagId === undefined) {
      await db
        .insert(tags)
        .values({ id: uuidv7(), userId: user.id, name: tagName })
        .onConflictDoNothing();

      const created = await db
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(eq(tags.userId, user.id), sql`lower(${tags.name}) = lower(${tagName})`),
        )
        .limit(1);
      tagId = created[0]?.id;
    }

    if (tagId === undefined) {
      return { ok: false, error: "Štítok sa nepodarilo založiť." };
    }

    await db
      .insert(taggables)
      .values({ tagId, entityType: "task", entityId: taskId })
      .onConflictDoNothing();

    revalidateViews();
    return { ok: true, data: { tagId } };
  } catch (error) {
    return fail(error, "Štítok sa nepodarilo priradiť.");
  }
}

/**
 * Odoberie štítok z úlohy. Samotný štítok sa nemaže — môže visieť na iných
 * úlohách a jeho zmiznutie by ich ticho ochudobnilo.
 */
export async function detachTag(
  taskId: string,
  tagId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const taskParsed = idSchema.safeParse(taskId);
    if (!taskParsed.success) return invalid(taskParsed.error, "Chýba identifikátor úlohy.");
    const tagParsed = idSchema.safeParse(tagId);
    if (!tagParsed.success) return invalid(tagParsed.error, "Chýba identifikátor štítka.");

    const db = await getDb();

    // Štítok aj úloha musia patriť tomu istému používateľovi.
    const owned = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, user.id)))
      .limit(1);
    if (!owned[0]) return { ok: false, error: "Štítok sa nenašiel." };

    const task = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
      .limit(1);
    if (!task[0]) return { ok: false, error: "Úloha sa nenašla." };

    await db
      .delete(taggables)
      .where(
        and(
          eq(taggables.tagId, tagId),
          eq(taggables.entityType, "task"),
          eq(taggables.entityId, taskId),
        ),
      );

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Štítok sa nepodarilo odobrať.");
  }
}

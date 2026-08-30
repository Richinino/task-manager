"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { DEFAULT_PILLARS } from "@/db/default-pillars";
import { learningPillars, skillMilestones, skills, tasks } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { parseMilestones } from "@/lib/learning";
import { requireUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   UČENIE — ZÁPIS

   Lekcia sa tu nezakladá. Lekcia je dokončená úloha s pilierom, takže jediné,
   čo sa o nej dá zapísať, je `setTaskLesson` — a to len mení dve polia na
   úlohe. Vznik a zánik lekcie riadi dokončenie úlohy, nie táto vrstva.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";
import type { ActionResult } from "@/server/action-result";

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDÁCIA
   ═══════════════════════════════════════════════════════════════════════════ */

const idSchema = z.string().min(1, "Chýba identifikátor.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Musí mať názov.")
  .max(200, "Názov je príliš dlhý.");

const colorSchema = z.string().trim().min(1).max(40);

const noteSchema = z.string().trim().max(2000, "Poznámka je príliš dlhá.");

/**
 * Míľnik má byť overiteľná veta, nie odsek.
 *
 * Dvesto znakov je dosť na „Otvoriť zámok s dvomi bezpečnostnými pinmi do
 * minúty" a málo na to, aby sa doň zmestil plán učenia. To je zámer: keď sa
 * míľnik nedá povedať jednou vetou, sú to v skutočnosti dva.
 */
const milestoneSchema = z
  .string()
  .trim()
  .min(1, "Míľnik musí mať znenie.")
  .max(200, "Míľnik je príliš dlhý — skús ho rozdeliť na dva.");

const evidenceSchema = z.string().trim().max(500, "Veta je príliš dlhá.");

const createPillarSchema = z.object({
  name: nameSchema,
  color: colorSchema.optional(),
});

const updatePillarSchema = z.object({
  name: nameSchema.optional(),
  color: colorSchema.optional(),
  sort: z.number().int("Poradie musí byť celé číslo.").optional(),
});

const createSkillSchema = z.object({
  pillarId: idSchema,
  name: nameSchema,
  note: noteSchema.nullish(),
  /** Míľniky sa dajú prilepiť rovno pri zakladaní — riadok = míľnik. */
  milestones: z.string().max(20_000, "Zoznam míľnikov je príliš dlhý.").optional(),
});

const updateSkillSchema = z.object({
  name: nameSchema.optional(),
  note: noteSchema.nullish(),
  pillarId: idSchema.optional(),
  sort: z.number().int("Poradie musí byť celé číslo.").optional(),
});

export type CreatePillarInput = z.infer<typeof createPillarSchema>;
export type UpdatePillarPatch = z.infer<typeof updatePillarSchema>;
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillPatch = z.infer<typeof updateSkillSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Učenie zasahuje aj do zoznamov úloh — lekcia je úloha, takže sa zmena
 * priradenia musí prejaviť aj tam, kde je riadok úlohy vidieť.
 */
const AFFECTED_PATHS = ["/ucenie", "/dnes", "/tyzden"] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/learning] ${message}`, error);
  return { ok: false, error: message };
}

async function ownsPillar(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: learningPillars.id })
    .from(learningPillars)
    .where(
      and(
        eq(learningPillars.id, id),
        eq(learningPillars.userId, userId),
        isNull(learningPillars.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] !== undefined;
}

/** Vráti pilier zručnosti, alebo `null`, keď zručnosť nie je používateľova. */
async function skillPillar(userId: string, id: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ pillarId: skills.pillarId })
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.userId, userId), isNull(skills.deletedAt)))
    .limit(1);
  return rows[0]?.pillarId ?? null;
}

/** Ďalšie voľné poradie v zozname — nové položky idú na koniec. */
async function nextSort(
  userId: string,
  table: typeof learningPillars | typeof skills,
): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ max: sql<number | null>`max(${table.sort})` })
    .from(table)
    .where(eq(table.userId, userId));
  return (rows[0]?.max ?? -1) + 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PILIERE
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createPillar(
  input: CreatePillarInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const parsed = createPillarSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje piliera.");

    const db = await getDb();
    const id = uuidv7();
    await db.insert(learningPillars).values({
      id,
      userId: user.id,
      name: parsed.data.name,
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      sort: await nextSort(user.id, learningPillars),
    });

    revalidateViews();
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Pilier sa nepodarilo vytvoriť.");
  }
}

/**
 * Naplní prázdnu sekciu štyrmi predvolenými piliermi.
 *
 * Beží len na výslovné kliknutie a len keď je sekcia prázdna. Nie pri prvom
 * prihlásení: kto sa nechce učiť nič, nemá dostať štyri prázdne priehradky,
 * ktoré musí najprv pomazať. A nie opakovane: druhé kliknutie by pridalo
 * druhú „Techniku" vedľa prvej.
 */
export async function seedDefaultPillars(): Promise<ActionResult<{ added: number }>> {
  const user = await requireUser();
  try {
    const db = await getDb();
    const existing = await db
      .select({ id: learningPillars.id })
      .from(learningPillars)
      .where(
        and(eq(learningPillars.userId, user.id), isNull(learningPillars.deletedAt)),
      )
      .limit(1);

    if (existing[0]) return { ok: true, data: { added: 0 } };

    await db.insert(learningPillars).values(
      DEFAULT_PILLARS.map((pillar, index) => ({
        id: uuidv7(),
        userId: user.id,
        name: pillar.name,
        color: pillar.color,
        sort: index,
      })),
    );

    revalidateViews();
    return { ok: true, data: { added: DEFAULT_PILLARS.length } };
  } catch (error) {
    return fail(error, "Piliere sa nepodarilo pripraviť.");
  }
}

export async function updatePillar(
  id: string,
  patch: UpdatePillarPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor piliera.");

    const parsed = updatePillarSchema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje piliera.");
    const data = parsed.data;

    if (!(await ownsPillar(user.id, id))) {
      return { ok: false, error: "Pilier sa nenašiel." };
    }

    const db = await getDb();
    await db
      .update(learningPillars)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(learningPillars.id, id), eq(learningPillars.userId, user.id)),
      );

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Pilier sa nepodarilo uložiť.");
  }
}

/**
 * Archivácia je predvolená cesta preč — história ostáva.
 *
 * Archivovaný pilier zmizne z prehľadu aj z ponuky pri úlohe, ale lekcie,
 * ktoré doň padli, sa nikam nestrácajú a po vrátení z archívu sú všetky späť.
 */
export async function archivePillar(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor piliera.");

    if (!(await ownsPillar(user.id, id))) {
      return { ok: false, error: "Pilier sa nenašiel." };
    }

    const db = await getDb();
    await db
      .update(learningPillars)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(learningPillars.id, id), eq(learningPillars.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Pilier sa nepodarilo archivovať.");
  }
}

/**
 * Zmazanie piliera aj so zručnosťami — a **aj s označením lekcií**.
 *
 * Zmazaný pilier by inak nechal za sebou úlohy, ktoré sa stále tvária ako
 * lekcia, ale ukazujú na niečo, čo už neexistuje: v riadku by svietil odznak
 * lekcie a v prehľade by ju nebolo vidieť nikde. Preto sa označenie z úloh
 * odoberá — úloha sama ostáva nedotknutá, len prestáva byť lekciou.
 *
 * Archivácia je pre prípad „už sa tomu nevenujem". Toto je pre prípad
 * „toto nemalo nikdy vzniknúť".
 */
export async function deletePillar(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor piliera.");

    if (!(await ownsPillar(user.id, id))) {
      return { ok: false, error: "Pilier sa nenašiel." };
    }

    const db = await getDb();
    const now = new Date();

    await db
      .update(tasks)
      .set({ lessonPillarId: null, lessonSkillId: null, updatedAt: now })
      .where(and(eq(tasks.userId, user.id), eq(tasks.lessonPillarId, id)));

    await db
      .update(skills)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(skills.userId, user.id), eq(skills.pillarId, id)));

    await db
      .update(learningPillars)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(learningPillars.id, id), eq(learningPillars.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Pilier sa nepodarilo zmazať.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZRUČNOSTI
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createSkill(
  input: CreateSkillInput,
): Promise<ActionResult<{ id: string; milestones: number }>> {
  const user = await requireUser();
  try {
    const parsed = createSkillSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje zručnosti.");
    const data = parsed.data;

    if (!(await ownsPillar(user.id, data.pillarId))) {
      return { ok: false, error: "Pilier sa nenašiel." };
    }

    const db = await getDb();
    const id = uuidv7();
    await db.insert(skills).values({
      id,
      userId: user.id,
      pillarId: data.pillarId,
      name: data.name,
      note: data.note ?? null,
      sort: await nextSort(user.id, skills),
    });

    const vety = data.milestones === undefined ? [] : parseMilestones(data.milestones);
    if (vety.length > 0) {
      await db.insert(skillMilestones).values(
        vety.map((title, index) => ({
          id: uuidv7(),
          userId: user.id,
          skillId: id,
          title,
          sort: index,
        })),
      );
    }

    revalidateViews();
    return { ok: true, data: { id, milestones: vety.length } };
  } catch (error) {
    return fail(error, "Zručnosť sa nepodarilo vytvoriť.");
  }
}

export async function updateSkill(
  id: string,
  patch: UpdateSkillPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) {
      return invalid(idParsed.error, "Chýba identifikátor zručnosti.");
    }

    const parsed = updateSkillSchema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje zručnosti.");
    const data = parsed.data;

    if ((await skillPillar(user.id, id)) === null) {
      return { ok: false, error: "Zručnosť sa nenašla." };
    }

    if (data.pillarId !== undefined && !(await ownsPillar(user.id, data.pillarId))) {
      return { ok: false, error: "Pilier sa nenašiel." };
    }

    const db = await getDb();
    await db
      .update(skills)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.note !== undefined ? { note: data.note ?? null } : {}),
        ...(data.pillarId !== undefined ? { pillarId: data.pillarId } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(skills.id, id), eq(skills.userId, user.id)));

    /*
      Presun zručnosti pod iný pilier musí presunúť aj jej lekcie. Inak by
      lekcia tvrdila „Hudba" a jej zručnosť by už žila pod „Ruky" — presne tá
      nezhoda, ktorú `checkRefs` v úlohách zakazuje uložiť.
    */
    if (data.pillarId !== undefined) {
      await db
        .update(tasks)
        .set({ lessonPillarId: data.pillarId, updatedAt: new Date() })
        .where(and(eq(tasks.userId, user.id), eq(tasks.lessonSkillId, id)));
    }

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Zručnosť sa nepodarilo uložiť.");
  }
}

export async function archiveSkill(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) {
      return invalid(idParsed.error, "Chýba identifikátor zručnosti.");
    }

    if ((await skillPillar(user.id, id)) === null) {
      return { ok: false, error: "Zručnosť sa nenašla." };
    }

    const db = await getDb();
    await db
      .update(skills)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(skills.id, id), eq(skills.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Zručnosť sa nepodarilo archivovať.");
  }
}

/**
 * Zmazanie zručnosti. Lekcie ostávajú lekciami — len bez zručnosti.
 *
 * Na rozdiel od piliera sa tu označenie z úloh neodoberá celé: to, že si sa
 * ten večer učil niečo z „Ruky", je stále pravda, aj keď zručnosť, ku ktorej
 * si to vtedy priradil, zanikla.
 */
export async function deleteSkill(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) {
      return invalid(idParsed.error, "Chýba identifikátor zručnosti.");
    }

    if ((await skillPillar(user.id, id)) === null) {
      return { ok: false, error: "Zručnosť sa nenašla." };
    }

    const db = await getDb();
    const now = new Date();

    await db
      .update(tasks)
      .set({ lessonSkillId: null, updatedAt: now })
      .where(and(eq(tasks.userId, user.id), eq(tasks.lessonSkillId, id)));

    await db
      .update(skills)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(skills.id, id), eq(skills.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Zručnosť sa nepodarilo zmazať.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MÍĽNIKY
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Prilepený zoznam → míľniky. Riadok = míľnik.
 *
 * Zoznam vzniká inde — na papieri alebo z AI — a sem sa dostane jedným
 * vložením. Zadávať ich cez formulár osemkrát za sebou by bolo presne to
 * trenie, kvôli ktorému sa takáto sekcia prestane používať.
 */
export async function addMilestones(
  skillId: string,
  text: string,
): Promise<ActionResult<{ added: number }>> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(skillId);
    if (!idParsed.success) {
      return invalid(idParsed.error, "Chýba identifikátor zručnosti.");
    }

    if ((await skillPillar(user.id, skillId)) === null) {
      return { ok: false, error: "Zručnosť sa nenašla." };
    }

    const vety = parseMilestones(text);
    if (vety.length === 0) {
      return { ok: false, error: "Nenašiel som ani jeden míľnik." };
    }

    const db = await getDb();
    const existujuce = await db
      .select({ sort: skillMilestones.sort })
      .from(skillMilestones)
      .where(
        and(
          eq(skillMilestones.skillId, skillId),
          eq(skillMilestones.userId, user.id),
        ),
      )
      .orderBy(asc(skillMilestones.sort));
    const zaciatok = (existujuce.at(-1)?.sort ?? -1) + 1;

    await db.insert(skillMilestones).values(
      vety.map((title, index) => ({
        id: uuidv7(),
        userId: user.id,
        skillId,
        title,
        sort: zaciatok + index,
      })),
    );

    revalidateViews();
    return { ok: true, data: { added: vety.length } };
  } catch (error) {
    return fail(error, "Míľniky sa nepodarilo pridať.");
  }
}

/**
 * Odškrtne míľnik, alebo odškrtnutie zruší.
 *
 * `evidence` je jedna veta „ako to vieš" a pýta sa len pri odškrtávaní. Je to
 * tá istá myšlienka ako „definícia hotovo" pri projekte: o rok je z toho
 * čitateľná história namiesto radu odškrtnutých políčok. Nepovinná ale je —
 * míľnik, ktorý sa nedá odškrtnúť bez písania, sa neodškrtne vôbec.
 */
export async function toggleMilestone(
  id: string,
  reached: boolean,
  evidence?: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor míľnika.");

    let veta: string | null = null;
    if (reached && evidence !== undefined) {
      const parsed = evidenceSchema.safeParse(evidence);
      if (!parsed.success) return invalid(parsed.error, "Neplatná veta.");
      veta = parsed.data === "" ? null : parsed.data;
    }

    const db = await getDb();
    const rows = await db
      .select({ id: skillMilestones.id })
      .from(skillMilestones)
      .where(and(eq(skillMilestones.id, id), eq(skillMilestones.userId, user.id)))
      .limit(1);
    if (!rows[0]) return { ok: false, error: "Míľnik sa nenašiel." };

    await db
      .update(skillMilestones)
      .set({
        reachedAt: reached ? new Date() : null,
        /* Zrušené odškrtnutie berie so sebou aj vetu — už nie je k čomu. */
        evidence: reached ? veta : null,
        updatedAt: new Date(),
      })
      .where(and(eq(skillMilestones.id, id), eq(skillMilestones.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Míľnik sa nepodarilo uložiť.");
  }
}

export async function updateMilestone(
  id: string,
  patch: { title?: string; sort?: number },
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor míľnika.");

    const schema = z.object({
      title: milestoneSchema.optional(),
      sort: z.number().int("Poradie musí byť celé číslo.").optional(),
    });
    const parsed = schema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje míľnika.");

    const db = await getDb();
    await db
      .update(skillMilestones)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.sort !== undefined ? { sort: parsed.data.sort } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(skillMilestones.id, id), eq(skillMilestones.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Míľnik sa nepodarilo uložiť.");
  }
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor míľnika.");

    const db = await getDb();
    await db
      .delete(skillMilestones)
      .where(and(eq(skillMilestones.id, id), eq(skillMilestones.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Míľnik sa nepodarilo zmazať.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ÚLOHA AKO LEKCIA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Označí úlohu za lekciu, alebo označenie zruší.
 *
 * `pillarId: null` znamená „toto nie je lekcia" a berie so sebou aj zručnosť.
 * Zručnosť bez piliera by bola lekcia, ktorá o sebe tvrdí, že lekciou nie je.
 *
 * **Nič sa tu nezaratáva.** Lekcia sa započíta až tým, že je úloha dokončená —
 * a to sa deje inde. Zápis je zámer, dokončenie je fakt, a analýza smie stáť
 * len na faktoch.
 */
export async function setTaskLesson(
  taskId: string,
  pillarId: string | null,
  skillId: string | null = null,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(taskId);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const db = await getDb();
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
      .limit(1);
    if (!rows[0]) return { ok: false, error: "Úloha sa nenašla." };

    if (pillarId === null) {
      await db
        .update(tasks)
        .set({ lessonPillarId: null, lessonSkillId: null, updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));
      revalidateViews();
      return { ok: true };
    }

    if (!(await ownsPillar(user.id, pillarId))) {
      return { ok: false, error: "Pilier sa nenašiel." };
    }

    if (skillId !== null) {
      const patri = await skillPillar(user.id, skillId);
      if (patri === null) return { ok: false, error: "Zručnosť sa nenašla." };
      if (patri !== pillarId) {
        return { ok: false, error: "Zručnosť patrí do iného piliera." };
      }
    }

    await db
      .update(tasks)
      .set({ lessonPillarId: pillarId, lessonSkillId: skillId, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Lekciu sa nepodarilo uložiť.");
  }
}

/**
 * Priradí zručnosť lekciám piliera, ktoré ju ešte nemajú.
 *
 * Toto je druhá polovica otázky, ktorú appka položí po druhej lekcii bez
 * zručnosti: „vytvoriť novú, alebo priradiť existujúcu?" Bez spätného
 * priradenia by odpoveď platila len pre lekcie, ktoré ešte len prídu — a tie
 * dve, ktoré sa na otázku pýtali, by ostali visieť mimo.
 *
 * Berie **všetky** lekcie piliera bez zručnosti, nie len tie v okne: keď raz
 * povieš, že tie večery patrili k lockpickingu, patrili k nemu aj vlani.
 */
export async function assignLooseLessons(
  pillarId: string,
  skillId: string,
): Promise<ActionResult<{ assigned: number }>> {
  const user = await requireUser();
  try {
    const pillarParsed = idSchema.safeParse(pillarId);
    if (!pillarParsed.success) {
      return invalid(pillarParsed.error, "Chýba identifikátor piliera.");
    }
    const skillParsed = idSchema.safeParse(skillId);
    if (!skillParsed.success) {
      return invalid(skillParsed.error, "Chýba identifikátor zručnosti.");
    }

    const patri = await skillPillar(user.id, skillId);
    if (patri === null) return { ok: false, error: "Zručnosť sa nenašla." };
    if (patri !== pillarId) {
      return { ok: false, error: "Zručnosť patrí do iného piliera." };
    }

    const db = await getDb();
    const kde = and(
      eq(tasks.userId, user.id),
      eq(tasks.lessonPillarId, pillarId),
      isNull(tasks.lessonSkillId),
      isNull(tasks.deletedAt),
    );

    /*
      Najprv sa spočíta, potom sa zapisuje. Odpoveď totiž ide rovno človeku
      („priradil som 4 lekcie") a driver tu `returning` neponúka rovnako
      v oboch prostrediach — PGlite lokálne a Neon v produkcii.
    */
    const dotknute = await db.select({ id: tasks.id }).from(tasks).where(kde);
    if (dotknute.length === 0) return { ok: true, data: { assigned: 0 } };

    await db
      .update(tasks)
      .set({ lessonSkillId: skillId, updatedAt: new Date() })
      .where(kde);

    revalidateViews();
    return { ok: true, data: { assigned: dotknute.length } };
  } catch (error) {
    return fail(error, "Lekcie sa nepodarilo priradiť.");
  }
}

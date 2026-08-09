"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/db";
import { areas, ideas, projects, taskEvents, tasks, type Idea } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { requireUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝSLEDOK AKCIE

   Rovnaký tvar ako v `actions/tasks.ts` a `actions/structure.ts`. Zdieľať ho
   importom sa nedá — zo súboru s `"use server"` smú viesť von len asynchrónne
   funkcie. Akcia nikdy nevyhodí výnimku ku klientovi.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? {} : { data: T }))
  | { ok: false; error: string };

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDÁCIA
   ═══════════════════════════════════════════════════════════════════════════ */

const idSchema = z.string().min(1, "Chýba identifikátor.");

/**
 * Názov nápadu má rovnaký strop ako názov projektu (200 znakov) zámerne:
 * pri povýšení sa z neho stáva názov projektu, a nechceme, aby povýšenie
 * zlyhalo na dĺžke až v momente, keď sa človek rozhodol konať. Podrobnosti
 * patria do `body`, nie do názvu.
 */
const titleSchema = z
  .string()
  .trim()
  .min(1, "Nápad musí mať názov.")
  .max(200, "Názov nápadu je príliš dlhý (najviac 200 znakov).");

const bodySchema = z.string().max(10_000, "Popis je príliš dlhý.");
const nextStepSchema = z.string().max(500, "Ďalší krok je príliš dlhý.");

const sparkSchema = z
  .number()
  .int("Iskra musí byť celé číslo.")
  .min(1, "Iskra je 1 až 5.")
  .max(5, "Iskra je 1 až 5.");

/**
 * Fázy, ktoré smie nastaviť človek. `promoted` sa dá dosiahnuť jedine cez
 * `promoteIdeaToProject` — inak by nápad tvrdil, že z neho vznikol projekt,
 * ktorý neexistuje. `faded` sa neukladá vôbec, odvodzuje sa pri čítaní.
 */
const stageSchema = z.enum(["raw", "incubating", "rejected"]);

const createIdeaSchema = z.object({
  title: titleSchema,
  body: bodySchema.nullish(),
  areaId: idSchema.nullish(),
  spark: sparkSchema.optional(),
  nextStep: nextStepSchema.nullish(),
});

const updateIdeaSchema = z.object({
  title: titleSchema.optional(),
  body: bodySchema.nullish(),
  areaId: idSchema.nullish(),
  spark: sparkSchema.optional(),
  nextStep: nextStepSchema.nullish(),
  stage: stageSchema.optional(),
});

export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;
export type UpdateIdeaPatch = z.infer<typeof updateIdeaSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

/** Obrazovka nápadov. Bežná zmena nápadu sa nikam inam nepremieta. */
const IDEA_PATHS = ["/napady"] as const;

/**
 * Povýšenie je iná káva: vznikne projekt a k nemu prvá úloha, takže sa mení
 * obsah obrazoviek úloh aj počty v štruktúre.
 */
const PROMOTION_PATHS = [
  "/napady",
  "/projekty",
  "/oblasti",
  "/dnes",
  "/tyzden",
  "/mesiac",
  "/inbox",
] as const;

function revalidate(paths: readonly string[]): void {
  for (const path of paths) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

/** Výnimka sa nikdy nedostane ku klientovi — zaloguje sa a nahradí hláškou. */
function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/ideas] ${message}`, error);
  return { ok: false, error: message };
}

/**
 * Signál, že nápad medzi načítaním a zápisom niekto povýšil alebo zmazal.
 *
 * Vyhadzuje sa vnútri transakcie, aby ju odvolal, a vonku sa prekladá na
 * zrozumiteľnú hlášku namiesto všeobecného „nepodarilo sa".
 */
class PromotionRaceError extends Error {}

/** Prázdny reťazec znamená „vymazať hodnotu", nie „ulož prázdno". */
function orNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function loadIdea(
  db: Database,
  userId: string,
  id: string,
): Promise<Idea | undefined> {
  const rows = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.userId, userId), isNull(ideas.deletedAt)))
    .limit(1);
  return rows[0];
}

/** Overí, že oblasť patrí používateľovi. `null`/`undefined` znamená „bez oblasti". */
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

/**
 * Každý zásah do nápadu je dotyk — `lastTouchedAt` sa obnoví aj pri obyčajnej
 * úprave textu. Práve preto vyblednutý nápad obživne bez osobitnej akcie.
 */
function touchFields(): { lastTouchedAt: Date; updatedAt: Date } {
  const now = new Date();
  return { lastTouchedAt: now, updatedAt: now };
}

/* ═══════════════════════════════════════════════════════════════════════════
   AKCIE

   Poradie v každej: requireUser → validácia → zápis → revalidatePath →
   ActionResult. `requireUser()` je zámerne mimo try/catch, aby presmerovanie
   z `redirect()` neskončilo v catch bloku.
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createIdea(
  input: CreateIdeaInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const parsed = createIdeaSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje nápadu.");
    const data = parsed.data;

    const db = await getDb();

    const areaError = await checkArea(db, user.id, data.areaId);
    if (areaError) return { ok: false, error: areaError };

    const id = uuidv7();
    await db.insert(ideas).values({
      id,
      userId: user.id,
      title: data.title,
      body: orNull(data.body) ?? null,
      areaId: data.areaId ?? null,
      ...(data.spark !== undefined ? { spark: data.spark } : {}),
      nextStep: orNull(data.nextStep) ?? null,
      lastTouchedAt: new Date(),
    });

    revalidate(IDEA_PATHS);
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Nápad sa nepodarilo vytvoriť.");
  }
}

export async function updateIdea(
  id: string,
  patch: UpdateIdeaPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor nápadu.");

    const parsed = updateIdeaSchema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje nápadu.");
    const data = parsed.data;

    const db = await getDb();

    const idea = await loadIdea(db, user.id, id);
    if (!idea) return { ok: false, error: "Nápad sa nenašiel." };

    /*
      Povýšený nápad sa už nedá poslať späť do zrenia: `promotedProjectId`
      by ostal visieť na projekte, ktorý sa medzitým tvári ako nesúvisiaci.
      Text sa upraviť dá — chceme vedieť, z čoho projekt vznikol, a keď to
      človek dopresní, nech to nezakáže technikália.
    */
    if (data.stage !== undefined && idea.stage === "promoted") {
      return {
        ok: false,
        error: "Nápad je už povýšený na projekt, jeho fázu meniť nemožno.",
      };
    }

    if (data.areaId !== undefined) {
      const areaError = await checkArea(db, user.id, data.areaId);
      if (areaError) return { ok: false, error: areaError };
    }

    await db
      .update(ideas)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.body !== undefined ? { body: orNull(data.body) ?? null } : {}),
        ...(data.areaId !== undefined ? { areaId: data.areaId ?? null } : {}),
        ...(data.spark !== undefined ? { spark: data.spark } : {}),
        ...(data.nextStep !== undefined
          ? { nextStep: orNull(data.nextStep) ?? null }
          : {}),
        ...(data.stage !== undefined ? { stage: data.stage } : {}),
        ...touchFields(),
      })
      .where(and(eq(ideas.id, id), eq(ideas.userId, user.id), isNull(ideas.deletedAt)));

    revalidate(IDEA_PATHS);
    return { ok: true };
  } catch (error) {
    return fail(error, "Nápad sa nepodarilo uložiť.");
  }
}

/** Posunie nápad vo zrení a osvieži `lastTouchedAt`. */
export async function setIdeaStage(
  id: string,
  stage: "raw" | "incubating" | "rejected",
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor nápadu.");

    const stageParsed = stageSchema.safeParse(stage);
    if (!stageParsed.success) return invalid(stageParsed.error, "Neplatná fáza nápadu.");

    const db = await getDb();

    const idea = await loadIdea(db, user.id, id);
    if (!idea) return { ok: false, error: "Nápad sa nenašiel." };
    if (idea.stage === "promoted") {
      return {
        ok: false,
        error: "Nápad je už povýšený na projekt, jeho fázu meniť nemožno.",
      };
    }

    await db
      .update(ideas)
      .set({ stage: stageParsed.data, ...touchFields() })
      .where(and(eq(ideas.id, id), eq(ideas.userId, user.id), isNull(ideas.deletedAt)));

    revalidate(IDEA_PATHS);
    return { ok: true };
  } catch (error) {
    return fail(error, "Fázu nápadu sa nepodarilo zmeniť.");
  }
}

/**
 * „Dotkol som sa ho" — len osvieži `lastTouchedAt`, nič iné nemení.
 *
 * Toto je jediný spôsob, ako oživiť vyblednutý nápad: zhnitie sa nikam
 * nezapisuje, takže stačí posunúť čas dotyku a nápad sa prestane hlásiť
 * ako `faded`.
 */
export async function touchIdea(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor nápadu.");

    const db = await getDb();

    const idea = await loadIdea(db, user.id, id);
    if (!idea) return { ok: false, error: "Nápad sa nenašiel." };

    await db
      .update(ideas)
      .set(touchFields())
      .where(and(eq(ideas.id, id), eq(ideas.userId, user.id), isNull(ideas.deletedAt)));

    revalidate(IDEA_PATHS);
    return { ok: true };
  } catch (error) {
    return fail(error, "Nápad sa nepodarilo osviežiť.");
  }
}

/**
 * Z nápadu spraví projekt a prepojí ich — jadro celého míľnika.
 *
 * V jednej transakcii vznikne projekt (názov, cieľ a oblasť z nápadu), z
 * `nextStep` sa stane PRVÁ ÚLOHA projektu a nápad sa prepne na `promoted`
 * s odkazom na projekt. Polovičné povýšenie je horšie než žiadne: projekt bez
 * väzby na nápad je sirota a nápad s `promotedProjectId` do prázdna je klamstvo.
 *
 * Nápad sa NEMAŽE — chceme vidieť, z čoho projekt vznikol.
 *
 * Projekt aj úloha sa zakladajú priamo cez `db.insert`, nie volaním akcií
 * z iných modulov: zo súboru s `"use server"` sa iné akcie volať nedajú a ani
 * by nezdieľali túto transakciu.
 */
export async function promoteIdeaToProject(
  id: string,
): Promise<ActionResult<{ projectId: string }>> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor nápadu.");

    const db = await getDb();

    const idea = await loadIdea(db, user.id, id);
    if (!idea) return { ok: false, error: "Nápad sa nenašiel." };

    if (idea.stage === "promoted" || idea.promotedProjectId !== null) {
      return {
        ok: false,
        error: "Nápad už bol povýšený na projekt — druhýkrát to nejde.",
      };
    }

    const name = idea.title.trim();
    const nameParsed = titleSchema.safeParse(name);
    if (!nameParsed.success) {
      return invalid(nameParsed.error, "Z tohto nápadu sa projekt spraviť nedá.");
    }

    /*
      Projekty sa v M3 nesmú volať rovnako (bez ohľadu na veľkosť písmen).
      Kontrola je tu preto, aby povýšenie zlyhalo zrozumiteľnou hláškou,
      a nie hláškou z databázy o porušenom obmedzení.
    */
    const clash = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.userId, user.id),
          isNull(projects.deletedAt),
          sql`lower(${projects.name}) = lower(${nameParsed.data})`,
        ),
      )
      .limit(1);
    if (clash[0]) {
      return {
        ok: false,
        error: `Projekt „${nameParsed.data}" už existuje — premenuj nápad pred povýšením.`,
      };
    }

    /*
      Oblasť sa prenáša len vtedy, keď ešte žije. Mazanie oblasti z M3
      o nápadoch nevedelo, takže `ideas.area_id` môže ukazovať na mäkko
      zmazaný riadok — taký by projekt zdedil neviditeľnú oblasť.
    */
    const areaId =
      idea.areaId !== null && (await checkArea(db, user.id, idea.areaId)) === null
        ? idea.areaId
        : null;

    const nextStep = idea.nextStep?.trim() ?? "";
    const projectId = uuidv7();
    const now = new Date();

    await db.transaction(async (tx) => {
      /*
        Zámok riadka nápadu ako PRVÝ krok transakcie.

        Obyčajný `select` by tu nestačil: na predvolenej izolácii READ COMMITTED
        dva súbežné pokusy prečítajú ten istý voľný nápad, obidva založia projekt
        a obidva ho prepíšu — ostane sirotský projekt s úlohou, o ktorom nápad
        nevie. `for update` druhý pokus zablokuje, kým prvý neskončí, a po
        uvoľnení sa podmienka `promoted_project_id is null` prehodnotí: riadok
        sa už nenájde a celá transakcia sa odvolá skôr, než čokoľvek založí.
      */
      const stillFree = await tx
        .select({ id: ideas.id })
        .from(ideas)
        .where(
          and(
            eq(ideas.id, id),
            eq(ideas.userId, user.id),
            isNull(ideas.deletedAt),
            isNull(ideas.promotedProjectId),
          ),
        )
        .limit(1)
        .for("update");

      if (!stillFree[0]) {
        throw new PromotionRaceError(`Nápad ${id} sa počas povýšenia zmenil pod rukami.`);
      }

      await tx.insert(projects).values({
        id: projectId,
        userId: user.id,
        name: nameParsed.data,
        // Popis nápadu je to najbližšie k cieľu, čo o ňom vieme.
        goal: idea.body,
        areaId,
      });

      /*
        Bez prvej úlohy vznikne prázdny projekt a človek nevie, kde začať —
        presne ten stav, pre ktorý nápady zapadnú prachom. Úloha dostane
        `todo` (nie `inbox`), lebo projekt už je jej miestom, a horizont
        `week`, keďže deň jej nikto nedal.
      */
      if (nextStep !== "") {
        const taskId = uuidv7();
        await tx.insert(tasks).values({
          id: taskId,
          userId: user.id,
          title: nextStep,
          status: "todo",
          priority: 3,
          horizon: "week",
          projectId,
          areaId,
        });

        await tx.insert(taskEvents).values({
          id: uuidv7(),
          userId: user.id,
          taskId,
          type: "created",
          toValue: nextStep,
        });
      }

      await tx
        .update(ideas)
        .set({
          stage: "promoted",
          promotedProjectId: projectId,
          lastTouchedAt: now,
          updatedAt: now,
        })
        .where(and(eq(ideas.id, id), eq(ideas.userId, user.id)));
    });

    revalidate(PROMOTION_PATHS);
    return { ok: true, data: { projectId } };
  } catch (error) {
    if (error instanceof PromotionRaceError) {
      return {
        ok: false,
        error: "Nápad sa medzitým zmenil — skús povýšenie znova.",
      };
    }
    return fail(error, "Nápad sa nepodarilo povýšiť na projekt.");
  }
}

/** Mäkké zmazanie. Povýšený projekt ani jeho úlohy sa nedotýkajú. */
export async function deleteIdea(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor nápadu.");

    const db = await getDb();

    const idea = await loadIdea(db, user.id, id);
    if (!idea) return { ok: false, error: "Nápad sa nenašiel." };

    await db
      .update(ideas)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(ideas.id, id), eq(ideas.userId, user.id), isNull(ideas.deletedAt)));

    revalidate(IDEA_PATHS);
    return { ok: true };
  } catch (error) {
    return fail(error, "Nápad sa nepodarilo zmazať.");
  }
}

/**
 * Vrátenie mäkko zmazaného nápadu. Jediné miesto, ktoré sa zámerne pozerá
 * na riadky s vyplneným `deletedAt` — inak by sa vrátiť nedali.
 *
 * `lastTouchedAt` sa NEobnovuje: obnovenie omylom zmazaného nápadu nie je
 * rozhodnutie o jeho budúcnosti a nemá mu resetovať hodiny zrenia.
 */
export async function restoreIdea(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor nápadu.");

    const db = await getDb();

    const rows = await db
      .select({ id: ideas.id })
      .from(ideas)
      .where(
        and(eq(ideas.id, id), eq(ideas.userId, user.id), isNotNull(ideas.deletedAt)),
      )
      .limit(1);
    if (!rows[0]) return { ok: false, error: "Zmazaný nápad sa nenašiel." };

    await db
      .update(ideas)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(ideas.id, id), eq(ideas.userId, user.id)));

    revalidate(IDEA_PATHS);
    return { ok: true };
  } catch (error) {
    return fail(error, "Nápad sa nepodarilo obnoviť.");
  }
}

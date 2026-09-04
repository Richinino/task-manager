"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/db";
import {
  areas,
  habits,
  learningPillars,
  projects,
  schoolSubjects,
  skills,
  taggables,
  tags,
  taskEvents,
  tasks,
  type Horizon,
  type Task,
  type TaskEvent,
  type TaskStatus,
} from "@/db/schema";
import { addDays, minutesIn, todayIn } from "@/lib/dates";
import { uuidv7 } from "@/lib/id";
import { parseCapture } from "@/lib/parse";
import { matchSubject } from "@/lib/subject-match";
import { applyRules } from "@/server/apply-rules";
import { SCHOOL_KINDS } from "@/lib/school-kind";
import { nextLessonDate } from "@/lib/school";
import { getLessonsForRange, listBreaks } from "@/server/queries/school";
import {
  getTask as getTaskWithRelations,
  type TaskWithRelations,
} from "@/server/queries/tasks";
import { nextOccurrence, parseRecurrence } from "@/lib/recurrence";
import { requireUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝSLEDOK AKCIE

   Akcia nikdy nevyhodí výnimku ku klientovi. Buď sa podarí, alebo vráti
   slovenskú hlášku, ktorú vie UI rovno zobraziť.

   Spoločný tvar žije v `@/server/action-result`. Re-export tu ostáva, aby
   existujúce importy z tohto modulu ďalej platili.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";
import type { ActionResult } from "@/server/action-result";

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

/**
 * Hranice, ktoré unesie databáza. Sú tu ako pomenované konštanty preto, že
 * na ne musí siahať aj orezávanie výstupu parsera — inak by sa hodnota, ktorú
 * náhľad sľúbil, ticho stratila. Klientský náhľad `ParsePreview` pozná tie
 * isté čísla a upozorní na ne ešte pred uložením. (Zdieľať ich importom sa
 * nedá — zo súboru s `"use server"` smú viesť von len asynchrónne funkcie.)
 */
const MAX_ESTIMATE_MIN = 1440;
const MAX_CONTEXT_LENGTH = 64;
/** Dlhší štítok než toto je preklep, nie štítok. */
const MAX_TAG_LENGTH = 64;

const titleSchema = z
  .string()
  .trim()
  .min(1, "Úloha musí mať názov.")
  .max(500, "Názov úlohy je príliš dlhý.");
const noteSchema = z.string().max(10_000, "Poznámka je príliš dlhá.");
const contextSchema = z
  .string()
  .trim()
  .max(MAX_CONTEXT_LENGTH, "Kontext je príliš dlhý.");
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
  .max(MAX_ESTIMATE_MIN, "Odhad je najviac 24 hodín.");

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
  /*
    Úloha patrí svojmu dňu a nepresúva sa. Tréning je buď v utorok, alebo
    nebol — medzi prepadnuté sa taká úloha nikdy nedostane.
  */
  staysOnDay: z.boolean().optional(),
  /*
    Úloha zaberie celý deň. V rozpočte nezaberá svoj odhad, ale celé okno
    dňa — takže sa na ten deň už nič iné neplánuje.
  */
  allDay: z.boolean().optional(),
  /*
    Úloha JE lekcia, keď má pilier. Samostatná tabuľka lekcií neexistuje —
    práve preto sa nemôže rozísť s úlohou, z ktorej vznikla. Zručnosť je
    nepovinná: učenie sa nezačína pomenovanou zručnosťou, ale tým, že si
    o niečom hodinu čítal, a priradiť sa dá aj spätne.
  */
  lessonPillarId: idSchema.nullish(),
  lessonSkillId: idSchema.nullish(),
  /*
    Úloha, ktorá plní návyk. Deň sa návyku zaráta až jej dokončením — mriežka
    si dni z úloh a z `habit_entries` iba zlúči, nikam sa nič nekopíruje.
  */
  habitId: idSchema.nullish(),
  /*
    Školský predmet. Z neho si úloha vie nájsť termín — najbližšiu hodinu
    toho predmetu. Termín sa PONÚKNE, nevnucuje; robí to obrazovka, nie táto
    akcia, aby človek videl, čo sa stalo, a vedel to prepísať.
  */
  subjectId: idSchema.nullish(),
  /* Domáca úloha, alebo písomka. Líšia sa tým, ako skoro sa majú ukázať. */
  schoolKind: z.enum(SCHOOL_KINDS).nullish(),
});

const createTaskSchema = taskFieldsSchema.extend({ title: titleSchema });

const updateTaskSchema = taskFieldsSchema.extend({
  title: titleSchema.optional(),
  sort: z.number().int("Poradie musí byť celé číslo.").optional(),
});

/**
 * Vstup pre `createTask`. Chýbajúce polia sa doplnia rozumnými defaultmi:
 * priorita 3, stav podľa toho, či je úloha naplánovaná, horizont podľa dátumu.
 * Priorita dňa sa nedá nastaviť pri vytvorení — je na to `setFrog`.
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
const AFFECTED_PATHS = [
  "/dnes",
  "/tyzden",
  "/mesiac",
  "/inbox",
  // Odkladiská z M3: bez nich by sa zoznam po akcii z menu riadku neobnovil,
  // kým človek na obrazovku nepríde znova.
  "/niekedy",
  "/caka-sa-na",
  // Zmena úlohy mení počty aj postup projektu, takže sa dotýka aj štruktúry.
  "/projekty",
  "/oblasti",
] as const;

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
    lessonPillarId?: string | null;
    lessonSkillId?: string | null;
    habitId?: string | null;
    subjectId?: string | null;
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

  if (refs.lessonPillarId) {
    const rows = await db
      .select({ id: learningPillars.id })
      .from(learningPillars)
      .where(
        and(
          eq(learningPillars.id, refs.lessonPillarId),
          eq(learningPillars.userId, userId),
          isNull(learningPillars.deletedAt),
        ),
      )
      .limit(1);
    if (!rows[0]) return "Pilier sa nenašiel.";
  }

  /*
    Zručnosť musí sedieť s pilierom. Bez tejto kontroly by sa dala uložiť
    lekcia, ktorá tvrdí „Hudba" a zároveň ukazuje na zručnosť z „Ruky" —
    a rozdelenie v analýze by od tej chvíle klamalo. Preto sa obe polia
    posielajú vždy spolu: samotná zručnosť je odmietnutá, nie domyslená.
  */
  if (refs.lessonSkillId && !refs.lessonPillarId) {
    return "Zručnosť sa dá priradiť len spolu s pilierom.";
  }

  if (refs.lessonSkillId) {
    const rows = await db
      .select({ pillarId: skills.pillarId })
      .from(skills)
      .where(
        and(
          eq(skills.id, refs.lessonSkillId),
          eq(skills.userId, userId),
          isNull(skills.deletedAt),
        ),
      )
      .limit(1);
    const skill = rows[0];
    if (!skill) return "Zručnosť sa nenašla.";
    if (refs.lessonPillarId && skill.pillarId !== refs.lessonPillarId) {
      return "Zručnosť patrí do iného piliera.";
    }
  }

  if (refs.habitId) {
    const rows = await db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.id, refs.habitId), eq(habits.userId, userId)))
      .limit(1);
    if (!rows[0]) return "Návyk sa nenašiel.";
  }

  if (refs.subjectId) {
    const rows = await db
      .select({ id: schoolSubjects.id })
      .from(schoolSubjects)
      .where(
        and(eq(schoolSubjects.id, refs.subjectId), eq(schoolSubjects.userId, userId)),
      )
      .limit(1);
    if (!rows[0]) return "Predmet sa nenašiel.";
  }

  return null;
}

/**
 * Polia lekcie na úlohe — obe naraz, alebo žiadne.
 *
 * Keď sa pilier odoberá, ide s ním aj zručnosť. Inak by v databáze ostala
 * úloha, ktorá o sebe tvrdí, že nie je lekcia, a pritom stále ukazuje na
 * zručnosť — a tá by sa v prehľade zručnosti počítala, hoci v prehľade
 * piliera nie.
 */
function lessonValues(data: {
  lessonPillarId?: string | null;
  lessonSkillId?: string | null;
}): { lessonPillarId?: string | null; lessonSkillId?: string | null } {
  if (data.lessonPillarId === undefined && data.lessonSkillId === undefined) return {};

  if (data.lessonPillarId !== undefined && (data.lessonPillarId ?? null) === null) {
    return { lessonPillarId: null, lessonSkillId: null };
  }

  return {
    ...(data.lessonPillarId !== undefined
      ? { lessonPillarId: data.lessonPillarId ?? null }
      : {}),
    ...(data.lessonSkillId !== undefined
      ? { lessonSkillId: data.lessonSkillId ?? null }
      : {}),
  };
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

/*
  Parser vie vrátiť hodnotu, ktorú databáza neunesie: „30h" je 1800 minút,
  ale stĺpec pripúšťa najviac 1440. Prejsť takú hodnotu cez `sanitize` znamená
  uložiť NULL — teda ticho zahodiť údaj, ktorý náhľad používateľovi ukázal ako
  rozpoznaný. Namiesto toho ju orežeme na povolené maximum: hodnota sa síce
  zmení, ale nezmizne. Náhľad `ParsePreview` na orezanie upozorní ešte pred
  uložením, takže sa to nedeje potichu.
*/

/** Odhad orezaný na `MAX_ESTIMATE_MIN`; nezmyselný vstup → `null`. */
function clampEstimate(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  const minutes = Math.round(value);
  if (minutes < 1) return null;
  return Math.min(minutes, MAX_ESTIMATE_MIN);
}

/** Kontext orezaný na `MAX_CONTEXT_LENGTH` znakov; prázdny → `null`. */
function clampContext(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, MAX_CONTEXT_LENGTH);
}

/**
 * Zapíše štítky rozpoznané parserom a naviaže ich na úlohu.
 *
 * Existujúci štítok sa hľadá bez ohľadu na veľkosť písmen — rovnako ako
 * projekt v `quickCapture` — aby „#Rodina" a „#rodina" neboli dva rôzne.
 * Nový sa založí; na `tags_user_name_idx` sa spoliehame pri súbežnom zápise,
 * preto po `onConflictDoNothing` štítok ešte raz dohľadáme.
 */
async function attachTags(
  db: Database,
  userId: string,
  taskId: string,
  names: string[],
): Promise<void> {
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (name === "") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    wanted.push(name);
  }
  if (wanted.length === 0) return;

  const tagIds: string[] = [];
  for (const name of wanted) {
    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(eq(tags.userId, userId), sql`lower(${tags.name}) = lower(${name})`),
      )
      .limit(1);

    let tagId = existing[0]?.id;
    if (tagId === undefined) {
      await db
        .insert(tags)
        .values({ id: uuidv7(), userId, name })
        .onConflictDoNothing();

      const created = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.userId, userId), eq(tags.name, name)))
        .limit(1);
      tagId = created[0]?.id;
    }

    if (tagId !== undefined) tagIds.push(tagId);
  }
  if (tagIds.length === 0) return;

  await db
    .insert(taggables)
    .values(
      tagIds.map((tagId) => ({
        tagId,
        entityType: "task" as const,
        entityId: taskId,
      })),
    )
    .onConflictDoNothing();
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
      ...lessonValues(data),
      habitId: data.habitId ?? null,
      subjectId: data.subjectId ?? null,
      schoolKind: data.schoolKind ?? null,
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
/**
 * Načíta jednu úlohu aj s väzbami — na otvorenie detailu odinakiaľ.
 *
 * Panel s detailom sa otvára celým objektom úlohy, nie identifikátorom: kto
 * ho otvára zo zoznamu, ten objekt už má a ušetrí to dotaz. Detail hodiny ho
 * ale nemá — pozná len úlohy k predmetu v okresanom tvare — a preto si ho
 * musí dopýtať.
 */
/* ═══════════════════════════════════════════════════════════════════════════
   ROZDELENIE ÚLOHY

   Úloha, ktorú si začal a nestihol dokončiť, sa na druhý deň hlási ako
   nespravená. Nie je to pravda a je to demotivujúce: spravená bola, len nie
   celá — a appka podľa vlastného sľubu nemá dávať pocit, že si pozadu.

   Rozdelenie vyrobí **hotový záznam o tom, čo si naozaj spravil**, a pôvodnú
   úlohu nechá bežať ďalej so zvyškom.

   Hotový záznam si **necháva pôvodný názov** — ten si zvolil človek a nemá sa
   meniť pod rukami. To, čo bolo spravené, ide pod neho ako druhý riadok
   (`completedPart`): „Napísať referát o Štefánikovi" a pod tým „úvod a osnova".
   V zozname sa tak dá prečítať, čoho sa tá hotová vec týkala, bez toho, aby
   sa musela otvárať.

   ## Prečo hotová časť vzniká ako NOVÁ úloha

   Opačné poradie — uzavrieť pôvodnú a založiť novú na zvyšok — by vyzeralo
   rovnako, ale zahodilo by všetko, čo na pôvodnej visí: podúlohy, prepojenia,
   opakovanie, pripomienky, históriu udalostí. Pokračovanie je tá istá vec,
   čo predtým, takže si má nechať svoju totožnosť. Nová je tá spravená časť —
   tá je záznam o práci a nič ťahať nepotrebuje.

   ## Čo hotová časť zdedí

   Všetko, čo hovorí, AKÝ druh práce to bol: oblasť, projekt, predmet, druh
   školskej úlohy, kontext, pilier, zručnosť, návyk.

   Áno, znamená to, že polovica učenia sa zaráta ako lekcia a druhá polovica
   neskôr ako ďalšia. To je správne — boli to dve sedenia. Nezarátať prvé
   z nich by bola presne tá krivda, kvôli ktorej rozdelenie vzniklo.
   ═══════════════════════════════════════════════════════════════════════════ */

const splitSchema = z.object({
  /** Čo z úlohy je hotové. Ide pod pôvodný názov ako druhý riadok. */
  doneTitle: z
    .string()
    .trim()
    .min(1, "Napíš, čo z toho je hotové.")
    .max(500, "Názov je príliš dlhý."),
  /** Kedy sa pokračuje. `undefined` deň pôvodnej úlohy nemení. */
  remainderDate: isoDateSchema.nullish(),
});

export type SplitTaskInput = z.infer<typeof splitSchema>;

export async function splitTask(
  id: string,
  input: SplitTaskInput,
): Promise<ActionResult<{ doneId: string }>> {
  const user = await requireUser();
  try {
    const parsed = splitSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Rozdelenie sa nepodarilo.");

    const db = await getDb();
    const task = await loadTask(db, user.id, id);
    if (task === undefined) return { ok: false, error: "Úloha sa nenašla." };

    if (task.status === "done") {
      return { ok: false, error: "Hotová úloha sa nedá rozdeliť." };
    }

    const todayIso = todayIn(user.settings.timezone);
    const doneId = uuidv7();

    await db.insert(tasks).values({
      id: doneId,
      userId: user.id,
      /* Názov ostáva jeho. Spravená časť je samostatný riadok pod ním. */
      title: task.title,
      completedPart: parsed.data.doneTitle,
      status: "done",
      completedAt: new Date(),
      /*
        Hotová časť patrí do dňa, v ktorom vznikla — dnes. Deň pôvodnej úlohy
        môže byť aj minulý a záznam o dnešnej práci by sa potom v prehľade dňa
        neobjavil, hoci sa práve stala.
      */
      plannedDate: todayIso,
      horizon: "day",
      priority: task.priority,
      energy: task.energy,
      /* Odhad sa nekopíruje: koľko trvala hotová časť, vie len človek. */
      areaId: task.areaId,
      projectId: task.projectId,
      context: task.context,
      subjectId: task.subjectId,
      schoolKind: task.schoolKind,
      lessonPillarId: task.lessonPillarId,
      lessonSkillId: task.lessonSkillId,
      habitId: task.habitId,
    });

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: doneId,
      type: "created",
      toValue: parsed.data.doneTitle,
    });

    /* Zvyšok pokračuje. Deň sa mení len vtedy, keď oň človek požiadal. */
    if (parsed.data.remainderDate !== undefined) {
      const remainderDate = parsed.data.remainderDate ?? null;
      await db
        .update(tasks)
        .set({
          plannedDate: remainderDate,
          horizon:
            remainderDate === null
              ? task.horizon
              : horizonForDate(remainderDate, todayIso),
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)));
    }

    revalidateViews();
    return { ok: true, data: { doneId } };
  } catch (error) {
    return fail(error, "Rozdelenie sa nepodarilo.");
  }
}

export async function loadTaskDetail(
  id: string,
): Promise<ActionResult<TaskWithRelations>> {
  const user = await requireUser();
  try {
    const task = await getTaskWithRelations(user.id, id);
    if (task === null) return { ok: false, error: "Úloha sa nenašla." };
    return { ok: true, data: task };
  } catch (error) {
    return fail(error, "Úlohu sa nepodarilo načítať.");
  }
}

export async function quickCapture(
  raw: string,
  opts?: { forceInbox?: boolean; defaultPlannedDate?: string },
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

    /*
      `defaultPlannedDate` prichádza z tlačidla „+" na konkrétnom dni. Je to
      len východisko — keď si používateľ v texte napíše vlastný deň („v piatok"),
      vyhráva ten. Inak by tlačidlo v stĺpci ticho prepisovalo, čo človek napísal.
    */
    const plannedDate = forceInbox
      ? null
      : (sanitize(isoDateSchema, parsed.plannedDate) ??
        sanitize(isoDateSchema, opts?.defaultPlannedDate));
    const plannedTime = forceInbox
      ? null
      : sanitize(isoTimeSchema, parsed.plannedTime);

    /*
      Školský predmet z názvu — „Fyzika DU" nájde `FYZ`.

      Rieši sa tu, na serveri, nie v parseri: parser by na to musel poznať
      zoznam predmetov, a ten je v databáze. Je to tá istá cesta, akou sa už
      prideľuje projekt podľa názvu.

      Predmet sa priradí AJ BEZ školského slova („Fyzika príklady" je tiež
      školská úloha). Naopak „DU" bez predmetu ostane len druhom úlohy —
      hádať, ktorého predmetu sa týka, by znamenalo vymyslieť si to.
    */
    let subjectId: string | null = null;
    const predmety = await db
      .select({
        id: schoolSubjects.id,
        code: schoolSubjects.code,
        name: schoolSubjects.name,
      })
      .from(schoolSubjects)
      .where(eq(schoolSubjects.userId, user.id));
    if (predmety.length > 0) {
      subjectId = matchSubject(title, predmety)?.id ?? null;
    }

    /*
      Vlastné pravidlá z nastavení. Prekladajú sa až tu, lebo držia mená
      („oblast:Zdravie") a na identifikátory ich vie preložiť len databáza.

      Použije sa z nich len to, čo si človek nenapísal sám — napísané `!1`
      prebije pravidlo s `!3`. Bez toho by sa nedala spraviť výnimka a človek
      by musel pravidlo prepisovať kvôli jednej úlohe.
    */
    const patch = await applyRules(user.id, title, user.settings.autoTagRules);

    if (projectId === null && patch.projectId !== undefined) {
      projectId = patch.projectId;
    }
    if (subjectId === null && patch.subjectId !== undefined) {
      subjectId = patch.subjectId;
    }

    /*
      Termín na najbližšiu hodinu toho predmetu — to isté, čo ponúka detail
      úlohy, len bez klikania. Ponúka sa LEN keď si termín nenapísal sám.

      Až TU, za pravidlami: predmet môže prísť aj z pravidla („matika" →
      `predmet:MAT`) a taká úloha si termín zaslúži rovnako ako tá, ktorej
      predmet vypadol z názvu.
    */
    let dueDate = sanitize(isoDateSchema, parsed.dueDate);
    if (dueDate === null && subjectId !== null) {
      const todayIsoPreTermin = todayIn(user.settings.timezone);
      const [hodiny, volna] = await Promise.all([
        getLessonsForRange(user.id, todayIsoPreTermin, addDays(todayIsoPreTermin, 183)),
        listBreaks(user.id),
      ]);
      dueDate =
        nextLessonDate(
          hodiny.map((h) => ({
            date: h.date,
            startTime: h.startTime,
            endTime: h.endTime,
            cancelled: h.cancelled,
            subjectId: h.subjectId,
          })),
          subjectId,
          todayIsoPreTermin,
          minutesIn(user.settings.timezone),
          volna.map((v) => ({ fromDate: v.fromDate, toDate: v.toDate })),
        ) ?? null;
    }


    const status: TaskStatus = plannedDate ? "todo" : "inbox";
    /*
      Naplánovaný deň určuje horizont sám — „na piatok" je proste tento
      týždeň. Pravidlo sa preto uplatní len na úlohu bez dňa, kde by inak
      ticho spadla do „tento týždeň", hoci pravidlo hovorí „niekedy".
    */
    const horizon: Horizon = plannedDate
      ? horizonForDate(plannedDate, todayIn(user.settings.timezone))
      : (patch.horizon ?? "week");

    const id = uuidv7();
    await db.insert(tasks).values({
      id,
      userId: user.id,
      title: title.slice(0, 500),
      status,
      priority: sanitize(prioritySchema, parsed.priority) ?? patch.priority ?? 3,
      dueDate,
      dueTime: sanitize(isoTimeSchema, parsed.dueTime),
      plannedDate,
      plannedTime,
      horizon,
      estimateMin:
        sanitize(estimateSchema, clampEstimate(parsed.estimateMin)) ??
        patch.estimateMin ??
        null,
      allDay: parsed.allDay === true,
      energy: sanitize(energySchema, parsed.energy) ?? patch.energy ?? null,
      context: sanitize(contextSchema, clampContext(parsed.context)),
      projectId,
      subjectId,
      /* Bez predmetu je „domáca úloha vs písomka" rozlíšenie o ničom. */
      schoolKind:
        subjectId === null ? null : (parsed.schoolKind ?? patch.schoolKind ?? null),
      areaId: patch.areaId ?? null,
      lessonPillarId: patch.lessonPillarId ?? null,
      lessonSkillId: patch.lessonSkillId ?? null,
      habitId: patch.habitId ?? null,
      isFrog: patch.isFrog === true,
      staysOnDay: patch.staysOnDay === true,
    });

    // Štítky sú samostatné riadky — bez tohto kroku by `#tag` z náhľadu
    // aj z titulku zmizol a nikde by sa neuložil.
    await attachTags(db, user.id, id, parsed.tags);

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
    if (data.staysOnDay !== undefined && data.staysOnDay !== task.staysOnDay) {
      values.staysOnDay = data.staysOnDay;
      changed.push("staysOnDay");
    }
    if (data.allDay !== undefined && data.allDay !== task.allDay) {
      values.allDay = data.allDay;
      /*
        Celodenná úloha nemá hodinu — dvojica „celý deň o 14:30" je
        protirečenie a v riadku by sa kreslila ako obyčajná naplánovaná vec.
      */
      if (data.allDay) values.plannedTime = null;
      changed.push("allDay");
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
    /*
      Mapuje sa po jednom, tak ako všetko ostatné v tejto akcii. Pridať pole
      len do zod schémy nestačí — akcia by vrátila úspech a nezapísala nič.
    */
    if (data.habitId !== undefined && (data.habitId ?? null) !== task.habitId) {
      values.habitId = data.habitId ?? null;
      changed.push("habitId");
    }
    if (data.subjectId !== undefined && (data.subjectId ?? null) !== task.subjectId) {
      values.subjectId = data.subjectId ?? null;
      changed.push("subjectId");
      /*
        Bez predmetu nemá zmysel ani „domáca úloha alebo písomka" — je to
        rozlíšenie vnútri školy. Nechať ho visieť by znamenalo úlohu, ktorá
        o sebe tvrdí, že je písomka, a pritom nepatrí k žiadnemu predmetu.
      */
      if ((data.subjectId ?? null) === null) values.schoolKind = null;
    }
    if (
      data.schoolKind !== undefined &&
      (data.schoolKind ?? null) !== task.schoolKind &&
      values.schoolKind === undefined
    ) {
      values.schoolKind = data.schoolKind ?? null;
      changed.push("schoolKind");
    }
    const lekcia = lessonValues(data);
    if (
      lekcia.lessonPillarId !== undefined &&
      lekcia.lessonPillarId !== task.lessonPillarId
    ) {
      values.lessonPillarId = lekcia.lessonPillarId;
      changed.push("lessonPillarId");
    }
    if (
      lekcia.lessonSkillId !== undefined &&
      lekcia.lessonSkillId !== task.lessonSkillId
    ) {
      values.lessonSkillId = lekcia.lessonSkillId;
      changed.push("lessonSkillId");
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
): Promise<ActionResult<{ done: boolean; nextDate?: string }>> {
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

    /*
      Opakovanie: dokončenie zakladá ďalší výskyt. Appka nemá cron a zavádzať
      ho kvôli tomuto je neúmerné — rovnaká úvaha ako pri zhnití nápadov v M4.

      Zakladá sa len pri ZAŠKRTNUTÍ, nie pri vrátení späť: odškrtnutie omylom
      by inak nechalo v zozname sirotu, ktorú by nikto nečakal.
    */
    let spawned: string | null = null;
    if (!wasDone) {
      spawned = await spawnNextOccurrence(
        db,
        user.id,
        task,
        todayIn(user.settings.timezone),
      );
    }

    revalidateViews();
    return { ok: true, data: { done: !wasDone, ...(spawned ? { nextDate: spawned } : {}) } };
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

const reasonSchema = z
  .string()
  .trim()
  .min(1, "Napíš, prečo to odkladáš.")
  .max(500, "Dôvod je príliš dlhý.");

export interface RescheduleOptions {
  /**
   * Prečo sa úloha odkladá znova. Povinný až v momente, keď odklad dovŕši
   * `settings.postponeBlockAt` — dovtedy sa neukladá.
   */
  reason?: string;
}

/**
 * Preplánovanie na iný deň (alebo zrušenie dátumu).
 *
 * Počítadlo odkladov stúpne **iba** ak úloha už deň mala, nový je neskorší
 * a úloha nie je uzavretá. Posun dopredu, zrušenie dátumu ani prvé
 * naplánovanie odklad nie sú.
 *
 * **Blok pri odkladoch.** Ten pokus, ktorý by počítadlo dovŕšil na
 * `settings.postponeBlockAt`, prejde len s dôvodom. Bez neho sa vráti
 * `code: "postpone_blocked"` a úloha ostane, kde bola — počítadlo teda nikdy
 * neprekročí prah bez toho, aby sa človek zastavil.
 *
 * Kontrola je zámerne tu, nie v dialógu: klient sa dá obísť zastaranou
 * záložkou aj druhým zariadením. Dialóg je len pohodlie.
 */
export async function rescheduleTask(
  id: string,
  plannedDate: string | null,
  options?: RescheduleOptions,
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

    /*
      Prah kontrolujeme až po `isPostpone`. Úlohu odloženú desaťkrát musí ísť
      stále presunúť dopredu alebo jej dátum zrušiť — blokovať treba útek,
      nie nápravu.
    */
    const blockAt = user.settings.postponeBlockAt;
    const hitsThreshold = isPostpone && postponeCount >= blockAt;

    let reason: string | null = null;
    if (hitsThreshold) {
      const raw = options?.reason;
      if (raw === undefined || raw.trim() === "") {
        return {
          ok: false,
          code: "postpone_blocked",
          detail: { postponeCount: task.postponeCount, postponeBlockAt: blockAt },
          error: `Túto úlohu si už odložil ${task.postponeCount}×. Rozhodni sa, čo s ňou.`,
        };
      }
      const reasonParsed = reasonSchema.safeParse(raw);
      if (!reasonParsed.success) {
        return invalid(reasonParsed.error, "Napíš, prečo to odkladáš.");
      }
      reason = reasonParsed.data;
    }

    const values: Partial<typeof tasks.$inferInsert> = {
      plannedDate: nextDate,
      postponeCount,
      updatedAt: new Date(),
    };
    if (nextDate) values.horizon = horizonForDate(nextDate, todayIn(user.settings.timezone));
    // Priorita dňa je záväzok konkrétneho dňa. Presunom na iný deň prestáva
    // platiť — prioritu nového dňa si treba vybrať vedome.
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
      note: reason,
    });

    revalidateViews();
    return { ok: true, data: { postponeCount } };
  } catch (error) {
    return fail(error, "Úlohu sa nepodarilo preplánovať.");
  }
}

/**
 * Priorita dňa. Na jeden `plannedDate` smie byť prioritou dňa najviac jedna
 * úloha — zapnutie preto v tej istej transakcii zhasne všetky ostatné v ten deň.
 *
 * Názov `setFrog` (a stĺpec `is_frog`) ostáva z pôvodného „eat the frog";
 * v rozhraní sa tomu hovorí výhradne „priorita dňa".
 */
export async function setFrog(id: string, on: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const onParsed = z.boolean().safeParse(on);
    if (!onParsed.success) {
      return invalid(onParsed.error, "Neplatná hodnota priority dňa.");
    }
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
      return {
        ok: false,
        error: "Prioritou dňa môže byť len úloha s naplánovaným dňom.",
      };
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
    return fail(error, "Prioritu dňa sa nepodarilo nastaviť.");
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

/* ═══════════════════════════════════════════════════════════════════════════
   PODÚLOHY A „ČAKÁ SA NA"
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Vytvorí podúlohu pod danou úlohou.
 *
 * Podúloha dedí `projectId` a `areaId` — patrí tam, kam patrí rodič. NEDEDÍ
 * dátumy ani prioritu: je to krok, nie samostatný záväzok, a vlastný termín
 * by z nej spravil druhú úlohu. Stav je `todo`, nie `inbox` — svoje miesto
 * už má, tak nemá čo robiť v nezatriedených veciach.
 *
 * Povolená je len jedna úroveň zanorenia. Strom podúloh sa v rozhraní stáva
 * neprehľadným a v M3 ho nepotrebujeme.
 */
export async function addSubtask(
  parentTaskId: string,
  title: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const parentParsed = idSchema.safeParse(parentTaskId);
    if (!parentParsed.success) {
      return invalid(parentParsed.error, "Chýba identifikátor nadradenej úlohy.");
    }

    const titleParsed = titleSchema.safeParse(title);
    if (!titleParsed.success) return invalid(titleParsed.error, "Neplatný názov.");

    const db = await getDb();
    const parent = await loadTask(db, user.id, parentTaskId);
    if (!parent) return { ok: false, error: "Nadradená úloha sa nenašla." };

    // Druhá úroveň zanorenia sa odmieta nahlas, nie tichým ignorovaním.
    if (parent.parentTaskId !== null) {
      return {
        ok: false,
        error: "Podúloha už nemôže mať vlastné podúlohy.",
      };
    }

    const id = uuidv7();
    const sortRows = await db
      .select({
        nextSort: sql<number>`cast(coalesce(max(${tasks.sort}), -1) + 1 as int)`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          eq(tasks.parentTaskId, parentTaskId),
          isNull(tasks.deletedAt),
        ),
      );
    const nextSort = Number(sortRows[0]?.nextSort ?? 0);

    await db.insert(tasks).values({
      id,
      userId: user.id,
      title: titleParsed.data,
      status: "todo",
      parentTaskId,
      projectId: parent.projectId,
      areaId: parent.areaId,
      sort: nextSort,
    });

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: id,
      type: "created",
      toValue: titleParsed.data,
    });

    revalidateViews();
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Podúlohu sa nepodarilo pridať.");
  }
}

/** Zmení poradie podúloh v rámci jedného rodiča. */
export async function reorderSubtasks(
  parentTaskId: string,
  ids: string[],
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const parentParsed = idSchema.safeParse(parentTaskId);
    if (!parentParsed.success) {
      return invalid(parentParsed.error, "Chýba identifikátor nadradenej úlohy.");
    }

    const idsParsed = z.array(idSchema).safeParse(ids);
    if (!idsParsed.success) return invalid(idsParsed.error, "Neplatný zoznam úloh.");
    if (idsParsed.data.length === 0) return { ok: true };

    const db = await getDb();

    /*
      Prepisujeme poradie len tým riadkom, ktoré danému rodičovi naozaj patria.
      Bez tejto podmienky by cudzie id v zozname prepísalo `sort` inej úlohy.
    */
    const owned = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          eq(tasks.parentTaskId, parentTaskId),
          isNull(tasks.deletedAt),
          inArray(tasks.id, idsParsed.data),
        ),
      );

    const allowed = new Set(owned.map((row) => row.id));
    const updates = idsParsed.data
      .map((id, index) => ({ id, index }))
      .filter((update) => allowed.has(update.id));

    if (updates.length === 0) return { ok: true };

    await db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(tasks)
          .set({ sort: update.index, updatedAt: new Date() })
          .where(and(eq(tasks.id, update.id), eq(tasks.userId, user.id)));
      }
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Poradie podúloh sa nepodarilo uložiť.");
  }
}

/**
 * Presunie úlohu do stavu „čaká sa na" a späť.
 *
 * Návrat späť MUSÍ úlohu vrátiť tam, kde je viditeľná: s naplánovaným dňom
 * do `todo`, bez neho do `inbox`. Inak by úloha zmizla zo všetkých obrazoviek
 * — inbox filtruje podľa stavu, ostatné podľa dátumu. Je to tá istá pasca,
 * na ktorej sa už raz stratili úlohy pri triedení v inboxe.
 */
export async function setWaiting(
  id: string,
  waiting: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const flagParsed = z.boolean().safeParse(waiting);
    if (!flagParsed.success) return invalid(flagParsed.error, "Neplatná hodnota.");

    const db = await getDb();
    const task = await loadTask(db, user.id, id);
    if (!task) return { ok: false, error: "Úloha sa nenašla." };

    const next: TaskStatus = flagParsed.data
      ? "waiting"
      : task.plannedDate
        ? "todo"
        : "inbox";

    if (task.status === next) return { ok: true };

    await db
      .update(tasks)
      .set({ status: next, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)));

    await db.insert(taskEvents).values({
      id: uuidv7(),
      userId: user.id,
      taskId: id,
      type: "status_changed",
      fromValue: task.status,
      toValue: next,
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Stav úlohy sa nepodarilo zmeniť.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   OPAKOVANIE

   Pravidlo drží samotná úloha v `recurrence_rule`. Ďalší výskyt je NOVÝ riadok
   s `recurrence_parent_id` na pôvodnú úlohu, nie posunutie dátumu — inak by sa
   stratila história a týždenný win report by o splnenej opakovanej úlohe nikdy
   nevedel.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Koreň reťazca opakovania — na ňom visia všetky výskyty. */
function recurrenceRootId(task: Task): string {
  return task.recurrenceParentId ?? task.id;
}

/**
 * Založí ďalší výskyt opakovanej úlohy. Vráti jeho deň, alebo `null`.
 *
 * Kopírujú sa len vlastnosti, ktoré má zmysel zopakovať: názov, poznámka,
 * priorita, odhad, energia, kontext, zaradenie. NEKOPÍRUJE sa `postponeCount`
 * ani `isFrog` — nový výskyt začína s čistým štítom a odklady predošlého
 * nie sú jeho vina.
 */
async function spawnNextOccurrence(
  db: Database,
  userId: string,
  task: Task,
  todayIso: string,
): Promise<string | null> {
  const rule = parseRecurrence(task.recurrenceRule);
  if (rule === null) return null;

  // Základom je deň, na ktorý bola úloha naplánovaná; keď žiadny nemala,
  // počíta sa od dnešku, inak by výskyt spadol do minulosti.
  const base = task.plannedDate ?? todayIso;
  const next = nextOccurrence(rule, base);
  if (next === null) return null;

  const rootId = recurrenceRootId(task);

  // Poistka proti dvojitému založeniu: dve rýchle odškrtnutia za sebou by inak
  // vyrobili dva rovnaké výskyty na ten istý deň.
  const existing = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.recurrenceParentId, rootId),
        eq(tasks.plannedDate, next),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (existing[0]) return null;

  const id = uuidv7();
  await db.insert(tasks).values({
    id,
    userId,
    title: task.title,
    note: task.note,
    status: "todo",
    priority: task.priority,
    plannedDate: next,
    plannedTime: task.plannedTime,
    horizon: horizonForDate(next, todayIso),
    estimateMin: task.estimateMin,
    energy: task.energy,
    context: task.context,
    projectId: task.projectId,
    areaId: task.areaId,
    recurrenceRule: task.recurrenceRule,
    recurrenceParentId: rootId,
  });

  await db.insert(taskEvents).values({
    id: uuidv7(),
    userId,
    taskId: id,
    type: "created",
    toValue: next,
    note: "opakovanie",
  });

  return next;
}

/** Nastaví alebo zruší pravidlo opakovania. `null` opakovanie vypne. */
export async function setRecurrence(
  id: string,
  rule: string | null,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    if (rule !== null && parseRecurrence(rule) === null) {
      return { ok: false, error: "Takémuto opakovaniu appka nerozumie." };
    }

    const db = await getDb();
    const task = await loadTask(db, user.id, id);
    if (!task) return { ok: false, error: "Úloha sa nenašla." };

    await db
      .update(tasks)
      .set({ recurrenceRule: rule, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Opakovanie sa nepodarilo uložiť.");
  }
}

/**
 * Dobehne zameškané výskyty opakovaných úloh až po dnešok.
 *
 * Volá to ranný sprievodca z M6. Bez toho by platilo, že čo sa nikdy
 * nedokončí, sa nikdy nezopakuje — mesačná faktúra by po jednom vynechaní
 * zmizla navždy.
 *
 * Zakladá sa VŽDY LEN JEDEN výskyt na reťazec, na najbližší platný deň od
 * posledného známeho. Sto prepadnutých faktúr v inboxe nikomu nepomôže a
 * z rituálu by spravilo trest.
 */
export async function materializeDueRecurrences(
  todayIso: string,
): Promise<ActionResult<{ created: number }>> {
  const user = await requireUser();
  try {
    const dateParsed = isoDateSchema.safeParse(todayIso);
    if (!dateParsed.success) return invalid(dateParsed.error, "Neplatný dátum.");
    const today = dateParsed.data;

    const db = await getDb();

    // Kandidáti: otvorené úlohy s pravidlom, ktorých deň už prešiel.
    const candidates = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          isNull(tasks.deletedAt),
          isNotNull(tasks.recurrenceRule),
          lt(tasks.plannedDate, today),
          notInArray(tasks.status, ["dropped"]),
        ),
      );

    // Na reťazec stačí najnovší výskyt — od neho sa počíta ďalší.
    const newestByRoot = new Map<string, Task>();
    for (const task of candidates) {
      const rootId = recurrenceRootId(task);
      const current = newestByRoot.get(rootId);
      if (current === undefined || (task.plannedDate ?? "") > (current.plannedDate ?? "")) {
        newestByRoot.set(rootId, task);
      }
    }

    let created = 0;
    for (const task of newestByRoot.values()) {
      const next = await spawnNextOccurrence(db, user.id, task, today);
      if (next !== null) created += 1;
    }

    if (created > 0) revalidateViews();
    return { ok: true, data: { created } };
  } catch (error) {
    return fail(error, "Opakované úlohy sa nepodarilo dobehnúť.");
  }
}

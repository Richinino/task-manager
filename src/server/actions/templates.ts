"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { taskEvents, tasks, templates, type Horizon } from "@/db/schema";
import { addDays, todayIn } from "@/lib/dates";
import { uuidv7 } from "@/lib/id";
import { requireUser } from "@/server/auth-guard";
import {
  MAX_TEMPLATE_TASKS,
  parseTemplatePayload,
  templatePayloadSchema,
  type TemplateTask,
} from "@/server/queries/templates";

/* ═══════════════════════════════════════════════════════════════════════════
   ŠABLÓNY — ZÁPIS A POUŽITIE

   Šablóna je POLE DEFINÍCIÍ, nie kópia existujúcich úloh — dôvod je rozpísaný
   v `@/server/queries/templates`, odkiaľ si tento modul berie aj tvar
   `payload`. Tu je dôsledok: `applyTemplate` nič nekopíruje, ale zakladá nové
   úlohy podľa predpisu, presne tak, ako keby ich človek napísal ručne.

   Rovnaký tvar odpovede ako ostatné akcie: nikdy sa nevyhodí výnimka ku
   klientovi, len slovenská hláška, ktorú vie UI rovno zobraziť.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";
import type { ActionResult } from "@/server/action-result";

/** Tvar riadka šablóny patrí čítacej vrstve; tu sa len prepošle ďalej. */
export type { TemplateTask } from "@/server/queries/templates";

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDÁCIA
   ═══════════════════════════════════════════════════════════════════════════ */

const idSchema = z.string().min(1, "Chýba identifikátor šablóny.");

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.");

/**
 * Názov je jediný údaj, podľa ktorého sa šablóna v zozname hľadá — preto je
 * povinný. Rovnaký strop ako pri projekte, aby sa dĺžky v appke nelíšili.
 */
const nameSchema = z
  .string()
  .trim()
  .min(1, "Šablóna musí mať názov.")
  .max(200, "Názov šablóny je príliš dlhý (najviac 200 znakov).");

const descriptionSchema = z.string().max(2000, "Popis šablóny je príliš dlhý.");

const createTemplateSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.nullish(),
  tasks: templatePayloadSchema,
});

/**
 * Úprava. `undefined` znamená „pole neprišlo, nemení sa"; `null` pri popise
 * znamená „vymaž ho". Zoznam úloh sa vždy nahrádza celý — dopĺňať jednotlivé
 * riadky by znamenalo poslať aj ich poradie, a poradie je práve to, čo sa pri
 * úprave šablóny mení najčastejšie.
 */
const updateTemplateSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema.nullish(),
  tasks: templatePayloadSchema.optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplatePatch = z.infer<typeof updateTemplateSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

/** Obrazovka šablón. Založenie ani úprava predpisu sa nikam inam nepremieta. */
const TEMPLATE_PATHS = ["/sablony"] as const;

/**
 * Použitie šablóny naozaj vyrobí úlohy, takže sa dotkne všetkého, čo úlohy
 * zobrazuje. Je to ten istý zoznam, aký má `createTask` — použitie šablóny nie
 * je nič iné než niekoľko založení naraz.
 */
const APPLIED_PATHS = [
  "/sablony",
  "/dnes",
  "/tyzden",
  "/mesiac",
  "/inbox",
  "/niekedy",
  "/caka-sa-na",
  "/projekty",
  "/oblasti",
] as const;

function revalidate(paths: readonly string[]): void {
  for (const path of paths) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

/** Výnimka sa nikdy nedostane ku klientovi — zaloguje sa a nahradí hláškou. */
function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/templates] ${message}`, error);
  return { ok: false, error: message };
}

/**
 * Na ktorý horizont dátum patrí.
 *
 * Je to úmyselná dvojička rovnakej funkcie z `@/server/actions/tasks`: zo
 * súboru s `"use server"` sa pomocná funkcia vyviezť nedá, takže sa importovať
 * nedala. Keď sa pravidlo horizontov zmení, musia sa zmeniť obe kópie — inak
 * by úloha zo šablóny skončila v inom horizonte než tá istá úloha napísaná
 * ručne.
 */
function horizonForDate(date: string, todayIso: string): Horizon {
  if (date <= addDays(todayIso, 1)) return "day";
  if (date <= addDays(todayIso, 7)) return "week";
  if (date.slice(0, 7) === todayIso.slice(0, 7)) return "month";
  return "someday";
}

/** Prázdny reťazec znamená „bez popisu", nie „ulož prázdno". */
function orNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/* ═══════════════════════════════════════════════════════════════════════════
   AKCIE

   Poradie v každej: requireUser → validácia → zápis → revalidatePath →
   ActionResult. `requireUser()` je zámerne mimo try/catch, aby presmerovanie
   z `redirect()` neskončilo v catch bloku.
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createTemplate(
  input: CreateTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const parsed = createTemplateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje šablóny.");
    const data = parsed.data;

    const db = await getDb();
    const id = uuidv7();

    await db.insert(templates).values({
      id,
      userId: user.id,
      name: data.name,
      description: orNull(data.description) ?? null,
      payload: data.tasks,
    });

    revalidate(TEMPLATE_PATHS);
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Šablónu sa nepodarilo založiť.");
  }
}

export async function updateTemplate(
  id: string,
  patch: UpdateTemplatePatch,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor šablóny.");

    const parsed = updateTemplateSchema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje šablóny.");
    const data = parsed.data;

    const db = await getDb();

    const rows = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, user.id)))
      .limit(1);
    if (!rows[0]) return { ok: false, error: "Šablóna sa nenašla." };

    await db
      .update(templates)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: orNull(data.description) ?? null }
          : {}),
        ...(data.tasks !== undefined ? { payload: data.tasks } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(templates.id, id), eq(templates.userId, user.id)));

    revalidate(TEMPLATE_PATHS);
    return { ok: true };
  } catch (error) {
    return fail(error, "Šablónu sa nepodarilo uložiť.");
  }
}

/**
 * Zmazanie šablóny je jediné tvrdé mazanie mimo návykov — a je v poriadku.
 *
 * Šablóna nie je záznam o vykonanej práci, ale predpis. Úlohy, ktoré z nej
 * kedysi vznikli, sú samostatné riadky a jej zmazanie sa ich nedotkne, takže
 * niet čo archivovať: mäkko zmazaná šablóna by bola len neviditeľný riadok,
 * ku ktorému sa nikto nikdy nevráti.
 */
export async function deleteTemplate(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor šablóny.");

    const db = await getDb();

    const rows = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, user.id)))
      .limit(1);
    if (!rows[0]) return { ok: false, error: "Šablóna sa nenašla." };

    await db
      .delete(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, user.id)));

    revalidate(TEMPLATE_PATHS);
    return { ok: true };
  } catch (error) {
    return fail(error, "Šablónu sa nepodarilo zmazať.");
  }
}

/**
 * Použije šablónu — z každého riadka vznikne skutočná úloha.
 *
 * Deň sa počíta ako `startDateIso + dayOffset`, takže tá istá šablóna sa dá
 * použiť kedykoľvek. Úlohy vznikajú podľa TÝCH ISTÝCH pravidiel ako pri
 * `createTask`: stav `todo` (deň už majú, takže do inboxu nepatria), horizont
 * podľa dátumu, priorita 3, keď predpis žiadnu nemá.
 *
 * Všetko v jednej transakcii. Polovične použitá šablóna je horšia než
 * nepoužitá: človek by nevedel, ktoré riadky už v zozname sú, a druhý pokus
 * by mu polovicu zdvojil.
 */
export async function applyTemplate(
  id: string,
  startDateIso: string,
): Promise<ActionResult<{ created: number }>> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor šablóny.");

    const dateParsed = isoDateSchema.safeParse(startDateIso);
    if (!dateParsed.success) return invalid(dateParsed.error, "Neplatný dátum začiatku.");
    const startDate = dateParsed.data;

    const db = await getDb();

    const rows = await db
      .select({ payload: templates.payload })
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, user.id)))
      .limit(1);

    const row = rows[0];
    if (!row) return { ok: false, error: "Šablóna sa nenašla." };

    /*
      Čítanie cez `parseTemplatePayload` — teda zhovievavo, riadok po riadku.
      Uložený `payload` mohol vzniknúť v staršom tvare a jeden nečitateľný
      riadok nesmie znemožniť použitie celej šablóny.
    */
    const definitions: TemplateTask[] = parseTemplatePayload(row.payload);
    if (definitions.length === 0) {
      return {
        ok: false,
        error: "Šablóna nemá ani jednu použiteľnú úlohu — najprv jej nejakú pridaj.",
      };
    }
    if (definitions.length > MAX_TEMPLATE_TASKS) {
      return { ok: false, error: `Šablóna má najviac ${MAX_TEMPLATE_TASKS} úloh.` };
    }

    /*
      Dnešok sa berie z pásma používateľa, nie z `new Date()` procesu: horizont
      sa počíta voči nemu a na Verceli (UTC) by inak vyšiel o deň vedľa.
    */
    const todayIso = todayIn(user.settings.timezone);

    const taskRows = definitions.map((definition) => {
      const plannedDate = addDays(startDate, definition.dayOffset ?? 0);
      return {
        id: uuidv7(),
        userId: user.id,
        title: definition.title,
        note: definition.note ?? null,
        status: "todo" as const,
        priority: definition.priority ?? 3,
        plannedDate,
        horizon: horizonForDate(plannedDate, todayIso),
        estimateMin: definition.estimateMin ?? null,
        energy: definition.energy ?? null,
        context: definition.context ?? null,
      };
    });

    const eventRows = taskRows.map((task) => ({
      id: uuidv7(),
      userId: user.id,
      taskId: task.id,
      type: "created" as const,
      toValue: task.title,
    }));

    await db.transaction(async (tx) => {
      // Hromadný zápis, nie riadok po riadku: pri desiatich úlohách by to bolo
      // dvadsať ciest do databázy a tie sa na Verceli sčítajú do čakania.
      await tx.insert(tasks).values(taskRows);
      await tx.insert(taskEvents).values(eventRows);
    });

    revalidate(APPLIED_PATHS);
    return { ok: true, data: { created: taskRows.length } };
  } catch (error) {
    return fail(error, "Šablónu sa nepodarilo použiť.");
  }
}

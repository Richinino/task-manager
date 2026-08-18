import "server-only";

import { asc, and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { templates } from "@/db/schema";

/* ═══════════════════════════════════════════════════════════════════════════
   ŠABLÓNY — ČÍTANIE A TVAR ULOŽENÉHO OBSAHU

   ŠABLÓNA JE POLE DEFINÍCIÍ, NIE KÓPIA EXISTUJÚCICH ÚLOH.

   Je to najdôležitejšie rozhodnutie celej tejto vrstvy, preto stojí hore.
   Lákavá alternatíva by bola držať v šablóne zoznam identifikátorov úloh,
   z ktorých vznikla — „urob mi znova toto". Lenže úlohy sa dokončujú, menia
   a mažú. „Ranná rutina" by sa rozbila v momente, keď by niekto zmazal
   pôvodné „nachystať kávu": šablóna by odkazovala na riadok, ktorý už
   neexistuje, a jej použitie by ticho vytvorilo o úlohu menej.

   Preto sa do `payload` ukladá SAMOSTATNÝ POPIS toho, čo má vzniknúť. Šablóna
   po založení nemá s pôvodnými úlohami nič spoločné a nič mimo nej ju nevie
   pokaziť. Cena je, že úpravou úlohy sa šablóna nezmení — a to je správne:
   šablóna je predpis, nie zrkadlo.

   `dayOffset` je z rovnakého dôvodu RELATÍVNY. „Príprava na dovolenku" sa dá
   použiť kedykoľvek; keby v sebe niesla konkrétne dátumy, dala by sa použiť
   práve raz.

   ─────────────────────────────────────────────────────────────────────────

   Prečo tu žije aj Zod schéma a nie v akcii: `payload` je `jsonb`, teda
   z pohľadu TypeScriptu `unknown` — overiť sa musí pri zápise aj pri čítaní.
   Modul s `"use server"` smie von vydávať len asynchrónne funkcie, takže
   schéma by sa z akcie exportovať nedala a vznikla by jej druhá kópia.
   Jeden zdroj pravdy je tu, akcia si ho odtiaľto berie.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Definícia jednej úlohy v šablóne. Podmnožina toho, čo vie `createTask` —
 * zámerne bez projektu, oblasti a termínu: to sú väzby na konkrétnu situáciu,
 * nie na predpis.
 */
export interface TemplateTask {
  title: string;
  note?: string;
  priority?: number;
  estimateMin?: number;
  energy?: "low" | "mid" | "high";
  context?: string;
  /** Posun oproti dňu použitia: 0 = v ten deň, 1 = nasledujúci. */
  dayOffset?: number;
}

/**
 * Koľko riadkov šablóna unesie. Nie je to technická hranica, ale vecná:
 * predpis na tridsať krokov nie je rutina, ale projekt — a na ten sú projekty.
 */
export const MAX_TEMPLATE_TASKS = 30;

/**
 * Najvzdialenejší posun. Rok dopredu pokryje aj „príprava na dovolenku",
 * ktorá sa rozbieha mesiace vopred; čokoľvek ďalej je preklep v číselníku.
 */
export const MAX_DAY_OFFSET = 365;

/** Rovnaké stropy, aké má stĺpec úlohy — inak by šablóna sľúbila, čo sa neuloží. */
const MAX_ESTIMATE_MIN = 1440;
const MAX_CONTEXT_LENGTH = 64;

/**
 * Jeden riadok šablóny.
 *
 * Anotácia typom `z.ZodType<TemplateTask>` je poistka pri preklade: keď sa
 * schéma a rozhranie rozídu, spadne to tu a nie až za behu na neúplnom
 * `payload`.
 */
export const templateTaskSchema: z.ZodType<TemplateTask> = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Úloha v šablóne musí mať názov.")
    .max(500, "Názov úlohy je príliš dlhý."),
  note: z.string().max(10_000, "Poznámka je príliš dlhá.").optional(),
  priority: z
    .number()
    .int("Priorita musí byť celé číslo.")
    .min(1, "Priorita je 1 až 3.")
    .max(3, "Priorita je 1 až 3.")
    .optional(),
  estimateMin: z
    .number()
    .int("Odhad musí byť celé číslo minút.")
    .min(1, "Odhad musí byť aspoň 1 minúta.")
    .max(MAX_ESTIMATE_MIN, "Odhad je najviac 24 hodín.")
    .optional(),
  energy: z.enum(["low", "mid", "high"]).optional(),
  context: z.string().trim().max(MAX_CONTEXT_LENGTH, "Kontext je príliš dlhý.").optional(),
  dayOffset: z
    .number()
    .int("Posun dňa musí byť celé číslo.")
    .min(0, "Posun dňa nemôže byť záporný — šablóna sa používa dopredu.")
    .max(MAX_DAY_OFFSET, "Posun dňa je najviac rok.")
    .optional(),
});

/**
 * Celý obsah šablóny.
 *
 * Prázdna šablóna sa nepripúšťa: pri použití by nevzniklo nič a človek by
 * hľadal chybu tam, kde žiadna nie je.
 */
export const templatePayloadSchema = z
  .array(templateTaskSchema)
  .min(1, "Šablóna musí mať aspoň jednu úlohu.")
  .max(MAX_TEMPLATE_TASKS, `Šablóna má najviac ${MAX_TEMPLATE_TASKS} úloh.`);

/** Šablóna tak, ako ju vidí obrazovka. */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  /** Rozobraný `payload`. Riadky, ktorým sa nedá veriť, sa sem nedostanú. */
  tasks: TemplateTask[];
}

/**
 * Nepovinné pole sa do JSON zapíše len vtedy, keď má hodnotu.
 *
 * Bez tohto by v `payload` sedeli kľúče s `undefined`, ktoré `JSON.stringify`
 * aj tak zahodí — ale medzitým by sa cez ne dalo prepísať pole na „nič"
 * spôsobom, ktorý sa v uloženom tvare nedá odlíšiť od „nikdy nenastavené".
 */
function compact(task: TemplateTask): TemplateTask {
  return {
    title: task.title,
    ...(task.note !== undefined ? { note: task.note } : {}),
    ...(task.priority !== undefined ? { priority: task.priority } : {}),
    ...(task.estimateMin !== undefined ? { estimateMin: task.estimateMin } : {}),
    ...(task.energy !== undefined ? { energy: task.energy } : {}),
    ...(task.context !== undefined ? { context: task.context } : {}),
    ...(task.dayOffset !== undefined ? { dayOffset: task.dayOffset } : {}),
  };
}

/**
 * `jsonb` → riadky šablóny. NIKDY nevyhodí výnimku.
 *
 * Overuje sa riadok po riadku, nie celé pole naraz: jeden pokazený zápis
 * (staršia verzia tvaru, ručný zásah do databázy) by inak zhodil obrazovku so
 * všetkými šablónami. Takto sa stratí len ten jeden riadok a zvyšok predpisu
 * ostane použiteľný.
 */
export function parseTemplatePayload(payload: unknown): TemplateTask[] {
  if (!Array.isArray(payload)) return [];

  const out: TemplateTask[] = [];
  for (const raw of payload) {
    if (out.length >= MAX_TEMPLATE_TASKS) break;
    const parsed = templateTaskSchema.safeParse(raw);
    if (parsed.success) out.push(compact(parsed.data));
  }
  return out;
}

/**
 * Všetky šablóny používateľa, abecedne.
 *
 * Zoradenie podľa názvu, nie podľa času vzniku: šablóna sa hľadá podľa toho,
 * ako sa volá („Ranná rutina"), nie podľa toho, kedy vznikla. Je ich zopár,
 * takže sa nestránkuje.
 *
 * Dátumy vzniku a úpravy sa zámerne nevracajú — obrazovka ich neukazuje
 * a formátovať dátum v klientovi znamená riskovať, že sa vykreslenie na
 * serveri a po hydratácii rozíde o deň.
 */
export async function listTemplates(userId: string): Promise<TemplateSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      description: templates.description,
      payload: templates.payload,
    })
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(asc(templates.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    tasks: parseTemplatePayload(row.payload),
  }));
}

/** Jedna šablóna, alebo `null`, keď neexistuje či patrí niekomu inému. */
export async function getTemplate(
  userId: string,
  id: string,
): Promise<TemplateSummary | null> {
  const db = await getDb();
  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      description: templates.description,
      payload: templates.payload,
    })
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tasks: parseTemplatePayload(row.payload),
  };
}

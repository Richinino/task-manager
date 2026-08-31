"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  schoolBreaks,
  schoolLessons,
  schoolSubjects,
  schoolTeachers,
} from "@/db/schema";
import { nextLessonDate } from "@/lib/school";
import { sviatkySkolskehoRoka } from "@/lib/sviatky";
import {
  getLesson,
  getLessonsForRange,
  getSubjectTasks,
  listBreaks,
  type LessonRow,
  type SubjectTask,
} from "@/server/queries/school";
import { addDays, minutesIn, todayIn } from "@/lib/dates";
import { competingGroups, groupsInFeed, parseIcs } from "@/lib/ics";
import { uuidv7 } from "@/lib/id";
import {
  OdberNedostupny,
  PrazdnyKalendar,
  importScheduleFor,
  maOdber,
  stiahniOdber,
  type ImportSummary,
} from "@/server/school-import";
import { requireUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   ŠKOLSKÝ ROZVRH — IMPORT

   Zdroj je kalendárny odber z EduPage. Neposiela sa doň nič a nič sa z neho
   nemaže — číta sa a prepisuje sa podľa neho rozvrh.

   Dve pravidlá, na ktorých import stojí:

   1. **Ručne upravený riadok sa nechá tak.** Suplovanie a poznámky sú jediné,
      čo v odbere nie je; keby ich import prepísal, prvá synchronizácia by
      zmazala všetko, čo si človek zapísal, a rozvrh by sa nedal opraviť.

   2. **Minulosť sa nemaže.** Import siaha len na dnešok a ďalej. Zmazať
      včerajšiu hodinu by znamenalo zmazať aj poznámku, ktorú si k nej napísal,
      a pritom sa už aj tak stala.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";
import type { ActionResult } from "@/server/action-result";

const icsSchema = z
  .string()
  .min(1, "Chýba obsah kalendára.")
  .max(4_000_000, "Kalendár je príliš veľký.");

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/school] ${message}`, error);
  return { ok: false, error: message };
}

const AFFECTED_PATHS = ["/rozvrh", "/dnes", "/tyzden"] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

export type { ImportSummary } from "@/server/school-import";

/**
 * Načíta rozvrh z obsahu kalendára (ICS) pre prihláseného človeka.
 *
 * Samotná práca je v `@/server/school-import` — rovnaký kód púšťa aj cron,
 * ktorý žiadne prihlásenie nemá. Dve kópie by znamenali, že ručný import
 * a automatický sa časom začnú správať inak.
 */
export async function importSchedule(
  ics: string,
): Promise<ActionResult<ImportSummary>> {
  const user = await requireUser();
  try {
    const parsed = icsSchema.safeParse(ics);
    if (!parsed.success) return invalid(parsed.error, "Neplatný kalendár.");

    const summary = await importScheduleFor(
      user.id,
      user.settings.timezone,
      user.settings.schoolGroups,
      parsed.data,
    );

    revalidateViews();
    return { ok: true, data: summary };
  } catch (error) {
    if (error instanceof PrazdnyKalendar) {
      return { ok: false, error: "V kalendári nie je ani jedna hodina." };
    }
    return fail(error, "Rozvrh sa nepodarilo načítať.");
  }
}

/**
 * Skupiny v odbere — na výber „ktoré sú moje", bez toho, aby sa čokoľvek
 * ukladalo. Vyberá sa len medzi tými, ktoré sa naozaj delia.
 */
export async function readGroups(
  ics: string,
): Promise<ActionResult<{ vsetky: string[]; delene: string[] }>> {
  await requireUser();
  try {
    const parsed = icsSchema.safeParse(ics);
    if (!parsed.success) return invalid(parsed.error, "Neplatný kalendár.");

    const hodiny = parseIcs(parsed.data);
    return {
      ok: true,
      data: { vsetky: groupsInFeed(hodiny), delene: competingGroups(hodiny) },
    };
  } catch (error) {
    return fail(error, "Skupiny sa nepodarilo prečítať.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DETAIL HODINY

   Načítava sa až pri otvorení, nie dopredu ku každej hodine. Na obrazovke
   rozvrhu je hodín štyridsať a ťahať ku každej z nich úlohy predmetu by
   znamenalo štyridsať dotazov za jedno vykreslenie — pritom otvorí sa jedna.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LessonDetail {
  lesson: LessonRow;
  /** Otvorené úlohy a písomky z toho predmetu. */
  tasks: SubjectTask[];
}

export async function loadLessonDetail(
  id: string,
): Promise<ActionResult<LessonDetail>> {
  const user = await requireUser();
  try {
    const lesson = await getLesson(user.id, id);
    if (lesson === null) return { ok: false, error: "Hodina sa nenašla." };

    return { ok: true, data: { lesson, tasks: await getSubjectTasks(user.id, lesson.subjectId) } };
  } catch (error) {
    return fail(error, "Detail hodiny sa nepodarilo načítať.");
  }
}

const noteSchema = z.string().trim().max(500, "Poznámka je príliš dlhá.");

/**
 * Poznámka k jednej konkrétnej hodine — „doniesť zošit".
 *
 * Zapísaním sa hodina označí ako ručne upravená, takže ju ďalší import
 * nechá tak. Bez toho by prvá synchronizácia poznámku zmazala.
 */
export async function setLessonNote(
  id: string,
  note: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const parsed = noteSchema.safeParse(note);
    if (!parsed.success) return invalid(parsed.error, "Neplatná poznámka.");

    const db = await getDb();
    const text = parsed.data === "" ? null : parsed.data;

    await db
      .update(schoolLessons)
      .set({ note: text, manual: true, updatedAt: new Date() })
      .where(and(eq(schoolLessons.id, id), eq(schoolLessons.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Poznámku sa nepodarilo uložiť.");
  }
}

/** Poznámka k predmetu — platí stále, naprieč všetkými jeho hodinami. */
export async function setSubjectNote(
  id: string,
  note: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const parsed = noteSchema.safeParse(note);
    if (!parsed.success) return invalid(parsed.error, "Neplatná poznámka.");

    const db = await getDb();
    await db
      .update(schoolSubjects)
      .set({
        note: parsed.data === "" ? null : parsed.data,
        updatedAt: new Date(),
      })
      .where(and(eq(schoolSubjects.id, id), eq(schoolSubjects.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Poznámku sa nepodarilo uložiť.");
  }
}

/**
 * Hodina odpadla — alebo predsa len bude.
 *
 * **Nemaže sa, len sa označí.** Prečiarknutá hodina v rozvrhu je informácia
 * („o desiatej mala byť matika"); prázdne miesto by vyzeralo, že tam nikdy nič
 * nebolo, a človek by po ňom hľadal, čo sa stalo. Do rozpočtu dňa sa taká
 * hodina neráta — čas, ktorý sa neučí, je voľný.
 */
export async function setLessonCancelled(
  id: string,
  cancelled: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const db = await getDb();
    await db
      .update(schoolLessons)
      .set({ cancelled, manual: true, updatedAt: new Date() })
      .where(and(eq(schoolLessons.id, id), eq(schoolLessons.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Zmenu sa nepodarilo uložiť.");
  }
}

/** Celý názov predmetu, doplnený ručne — zdroj dodáva len skratku. */
export async function setSubjectName(
  id: string,
  name: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const parsed = z
      .string()
      .trim()
      .max(120, "Názov je príliš dlhý.")
      .safeParse(name);
    if (!parsed.success) return invalid(parsed.error, "Neplatný názov.");

    const db = await getDb();
    await db
      .update(schoolSubjects)
      .set({
        name: parsed.data === "" ? null : parsed.data,
        updatedAt: new Date(),
      })
      .where(and(eq(schoolSubjects.id, id), eq(schoolSubjects.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Názov sa nepodarilo uložiť.");
  }
}

/** Celé meno vyučujúceho, doplnené ručne — zdroj dodáva len skratku. */
export async function setTeacherName(
  id: string,
  name: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const parsed = z.string().trim().max(120, "Meno je príliš dlhé.").safeParse(name);
    if (!parsed.success) return invalid(parsed.error, "Neplatné meno.");

    const db = await getDb();
    await db
      .update(schoolTeachers)
      .set({ name: parsed.data === "" ? null : parsed.data, updatedAt: new Date() })
      .where(and(eq(schoolTeachers.id, id), eq(schoolTeachers.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Meno sa nepodarilo uložiť.");
  }
}

/**
 * Predmety a vyučujúci na doplnenie mien — skratka a to, čo už je vyplnené.
 *
 * Zdroj dodáva len skratky (`ANJ`, `LIN`), celé názvy v ňom nie sú vôbec.
 * Doplnia sa raz a ďalší import sa ich nedotkne.
 */
export async function listNameable(): Promise<
  ActionResult<{
    subjects: { id: string; code: string; name: string | null }[];
    teachers: { id: string; code: string; name: string | null }[];
  }>
> {
  const user = await requireUser();
  try {
    const db = await getDb();
    const subjects = await db
      .select({ id: schoolSubjects.id, code: schoolSubjects.code, name: schoolSubjects.name })
      .from(schoolSubjects)
      .where(eq(schoolSubjects.userId, user.id));
    const teachers = await db
      .select({ id: schoolTeachers.id, code: schoolTeachers.code, name: schoolTeachers.name })
      .from(schoolTeachers)
      .where(eq(schoolTeachers.userId, user.id));

    return { ok: true, data: { subjects, teachers } };
  } catch (error) {
    return fail(error, "Zoznam sa nepodarilo načítať.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   TERMÍN PODĽA ROZVRHU
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Kedy je najbližšia hodina toho predmetu.
 *
 * Toto je tá vec, kvôli ktorej má rozvrh v appke zmysel oproti EduPage:
 * napíšeš „domáca úloha na matiku", vyberieš predmet a termín sa **ponúkne
 * sám** — na deň tej hodiny. Ponúkne, nevnucuje: dátum sa predvyplní
 * a dá sa prepísať.
 *
 * Voľná sa preskakujú a odpadnuté hodiny sa neponúkajú; podrobne
 * v `nextLessonDate`. Vracia `null`, keď predmet ďalšiu hodinu nemá —
 * obrazovka vtedy termín nechá tak, namiesto aby hádala.
 */
export async function nextLessonForSubject(
  subjectId: string,
): Promise<ActionResult<{ date: string | null }>> {
  const user = await requireUser();
  try {
    const timeZone = user.settings.timezone;
    const todayIso = todayIn(timeZone);

    /*
      Okno je pol roka. Predmet, ktorý nemá hodinu ani za pol roka, ju
      spravidla nemá vôbec — a ťahať kvôli tomu celú tabuľku by bolo drahšie
      než odpoveď „neviem".
    */
    const [hodiny, volna] = await Promise.all([
      getLessonsForRange(user.id, todayIso, addDays(todayIso, 183)),
      listBreaks(user.id),
    ]);

    const date = nextLessonDate(
      hodiny.map((h) => ({
        date: h.date,
        startTime: h.startTime,
        endTime: h.endTime,
        cancelled: h.cancelled,
        subjectId: h.subjectId,
      })),
      subjectId,
      todayIso,
      minutesIn(timeZone),
      volna.map((v) => ({ fromDate: v.fromDate, toDate: v.toDate })),
    );

    return { ok: true, data: { date } };
  } catch (error) {
    return fail(error, "Najbližšiu hodinu sa nepodarilo nájsť.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   STIAHNUTIE Z EDUPAGE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Je odber vôbec nastavený? Obrazovka podľa toho ukáže alebo skryje tlačidlo.
 *
 * Samotnú adresu NEVRACIA a nikdy vracať nebude. Je to prístup k rozvrhu —
 * kto ju má, vidí, kde si kedy. Do prehliadača nemá čo ísť.
 */
export async function hasFeedUrl(): Promise<boolean> {
  await requireUser();
  return maOdber();
}

/** Stiahne rozvrh z uloženej adresy a načíta ho. */
export async function syncScheduleFromUrl(): Promise<ActionResult<ImportSummary>> {
  const user = await requireUser();
  try {
    const summary = await importScheduleFor(
      user.id,
      user.settings.timezone,
      user.settings.schoolGroups,
      await stiahniOdber(),
    );

    revalidateViews();
    return { ok: true, data: summary };
  } catch (error) {
    if (error instanceof OdberNedostupny) return { ok: false, error: error.message };
    if (error instanceof PrazdnyKalendar) {
      return { ok: false, error: "V odbere nie je ani jedna hodina." };
    }
    return fail(error, "Rozvrh sa nepodarilo stiahnuť.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   VOĽNÁ

   Odber rozvrhu je rozvrh natiahnutý na dátumy, nie denný plán — sviatky
   ani prázdniny v ňom vynechané nie sú. Bez tejto vrstvy by appka na
   Sedembolestnú tvrdila, že máš celý deň školu, a termín domácej úlohy by
   padol na deň, keď škola nie je.
   ═══════════════════════════════════════════════════════════════════════════ */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.");

const breakSchema = z
  .object({
    fromDate: isoDate,
    toDate: isoDate,
    label: z
      .string()
      .trim()
      .min(1, "Voľno musí mať názov.")
      .max(120, "Názov je príliš dlhý."),
  })
  /* Obrátený rozsah by ticho neplatil na žiadny deň — lepšie ho odmietnuť. */
  .refine((v) => v.fromDate <= v.toDate, {
    message: "Koniec nemôže byť pred začiatkom.",
    path: ["toDate"],
  });

export type AddBreakInput = z.infer<typeof breakSchema>;

export async function addBreak(input: AddBreakInput): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const parsed = breakSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné voľno.");

    const db = await getDb();
    await db.insert(schoolBreaks).values({
      id: uuidv7(),
      userId: user.id,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      label: parsed.data.label,
    });

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Voľno sa nepodarilo pridať.");
  }
}

export async function deleteBreak(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const db = await getDb();
    await db
      .delete(schoolBreaks)
      .where(and(eq(schoolBreaks.id, id), eq(schoolBreaks.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Voľno sa nepodarilo zmazať.");
  }
}

/**
 * Doplní štátne sviatky školského roka.
 *
 * Sú to jediné voľná, ktoré sa dajú vypočítať. Školské prázdniny určuje
 * ministerstvo, líšia sa podľa kraja a menia sa každý rok — tie treba zadať
 * ručne a appka ich hádať nebude.
 *
 * Dátumy, ktoré už nejaké voľno pokrýva, sa preskočia: druhé kliknutie nemá
 * vyrobiť pätnásť duplikátov.
 */
export async function addPublicHolidays(
  schoolYear: number,
): Promise<ActionResult<{ added: number; skipped: number }>> {
  const user = await requireUser();
  try {
    const parsed = z
      .number()
      .int()
      .min(2000)
      .max(2100)
      .safeParse(schoolYear);
    if (!parsed.success) return invalid(parsed.error, "Neplatný školský rok.");

    const db = await getDb();
    const uzMa = await db
      .select({ fromDate: schoolBreaks.fromDate, toDate: schoolBreaks.toDate })
      .from(schoolBreaks)
      .where(eq(schoolBreaks.userId, user.id));

    const sviatky = sviatkySkolskehoRoka(parsed.data);
    const nove = sviatky.filter(
      (s) => !uzMa.some((v) => v.fromDate <= s.date && s.date <= v.toDate),
    );

    if (nove.length > 0) {
      await db.insert(schoolBreaks).values(
        nove.map((s) => ({
          id: uuidv7(),
          userId: user.id,
          fromDate: s.date,
          toDate: s.date,
          label: s.nazov,
        })),
      );
    }

    revalidateViews();
    return {
      ok: true,
      data: { added: nove.length, skipped: sviatky.length - nove.length },
    };
  } catch (error) {
    return fail(error, "Sviatky sa nepodarilo pridať.");
  }
}


"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { schoolLessons, schoolSubjects, schoolTeachers } from "@/db/schema";
import {
  getLesson,
  getSubjectTasks,
  type LessonRow,
  type SubjectTask,
} from "@/server/queries/school";
import { todayIn } from "@/lib/dates";
import { competingGroups, filterByGroups, groupsInFeed, parseIcs } from "@/lib/ics";
import { uuidv7 } from "@/lib/id";
import { subjectColor } from "@/lib/school-colors";
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

/** `2026-09-07T06:00:00Z` → `08:00` v pásme používateľa. */
function miestnyCas(okamih: Date, timeZone: string): string {
  const casti = new Intl.DateTimeFormat("sk-SK", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(okamih);

  const hod = casti.find((c) => c.type === "hour")?.value ?? "00";
  const min = casti.find((c) => c.type === "minute")?.value ?? "00";
  return `${hod}:${min}`;
}

export interface ImportSummary {
  /** Koľko hodín odber obsahoval spolu (aj cudzie skupiny). */
  voFeede: number;
  /** Koľko z nich je jeho po odfiltrovaní delenia. */
  mojich: number;
  pridanych: number;
  upravenych: number;
  zmazanych: number;
  /** Ponechané, lebo ich upravil človek. */
  ponechanych: number;
  novychPredmetov: number;
  novychUcitelov: number;
  /** Skupiny, medzi ktorými sa vyberá — na výzvu, keď ešte nevyberal. */
  deleneSkupiny: string[];
}

/**
 * Načíta rozvrh z obsahu kalendára (ICS).
 *
 * Text sem príde už stiahnutý — sťahovanie je zvlášť, aby sa dal import
 * otestovať aj zo súboru a aby jedna nedostupná adresa nezhodila celú akciu.
 */
export async function importSchedule(
  ics: string,
): Promise<ActionResult<ImportSummary>> {
  const user = await requireUser();
  try {
    const parsed = icsSchema.safeParse(ics);
    if (!parsed.success) return invalid(parsed.error, "Neplatný kalendár.");

    const vsetky = parseIcs(parsed.data);
    if (vsetky.length === 0) {
      return { ok: false, error: "V kalendári nie je ani jedna hodina." };
    }

    const timeZone = user.settings.timezone;
    const moje = filterByGroups(vsetky, user.settings.schoolGroups);

    /*
      Import siaha len na dnešok a ďalej. Odber nesie aj minulosť, ale tá je
      hotová — a keby sa prepísala, zmizli by s ňou poznámky k odučeným
      hodinám.
    */
    const dnes = todayIn(timeZone);
    const buduce = moje.filter((h) => todayIn(timeZone, h.start) >= dnes);

    const db = await getDb();

    /* ── predmety a vyučujúci ───────────────────────────────────────────── */
    const predmetyVoFeede = [...new Set(buduce.map((h) => h.subject))];
    const ucitelia = [...new Set(buduce.map((h) => h.teacher).filter((t) => t !== ""))];

    const existujucePredmety = await db
      .select()
      .from(schoolSubjects)
      .where(eq(schoolSubjects.userId, user.id));
    const predmetPodlaKodu = new Map(existujucePredmety.map((p) => [p.code, p]));

    const pouziteFarby = existujucePredmety.map((p) => p.color);
    const novePredmety = predmetyVoFeede.filter((k) => !predmetPodlaKodu.has(k));

    for (const kod of novePredmety) {
      const farba = subjectColor(kod, pouziteFarby);
      pouziteFarby.push(farba);
      const id = uuidv7();
      await db
        .insert(schoolSubjects)
        .values({ id, userId: user.id, code: kod, color: farba });
      predmetPodlaKodu.set(kod, {
        id,
        userId: user.id,
        code: kod,
        name: null,
        color: farba,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const existujuciUcitelia = await db
      .select()
      .from(schoolTeachers)
      .where(eq(schoolTeachers.userId, user.id));
    const ucitelPodlaKodu = new Map(existujuciUcitelia.map((u) => [u.code, u]));
    const noviUcitelia = ucitelia.filter((k) => !ucitelPodlaKodu.has(k));

    for (const kod of noviUcitelia) {
      const id = uuidv7();
      await db.insert(schoolTeachers).values({ id, userId: user.id, code: kod });
      ucitelPodlaKodu.set(kod, {
        id,
        userId: user.id,
        code: kod,
        name: null,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    /* ── hodiny ─────────────────────────────────────────────────────────── */
    const ulozene = await db
      .select()
      .from(schoolLessons)
      .where(eq(schoolLessons.userId, user.id));
    const buduceUlozene = ulozene.filter((h) => h.date >= dnes);

    /* Kľúč slotu musí sedieť s jedinečným indexom v schéme. */
    const kluc = (date: string, period: number, subjectId: string): string =>
      `${date}|${period}|${subjectId}`;

    const podlaKluca = new Map(
      buduceUlozene.map((h) => [kluc(h.date, h.period, h.subjectId), h]),
    );

    let pridanych = 0;
    let upravenych = 0;
    let ponechanych = 0;
    const videne = new Set<string>();

    for (const h of buduce) {
      const predmet = predmetPodlaKodu.get(h.subject);
      if (predmet === undefined) continue;

      const datum = todayIn(timeZone, h.start);
      const period = h.period ?? 0;
      const k = kluc(datum, period, predmet.id);
      videne.add(k);

      const hodnoty = {
        startTime: miestnyCas(h.start, timeZone),
        endTime: miestnyCas(h.end, timeZone),
        teacherId: ucitelPodlaKodu.get(h.teacher)?.id ?? null,
        room: h.room === "" ? null : h.room,
        groupName: h.group === "" ? null : h.group,
        sourceUid: h.uid,
      };

      const stara = podlaKluca.get(k);

      if (stara === undefined) {
        await db.insert(schoolLessons).values({
          id: uuidv7(),
          userId: user.id,
          date: datum,
          period,
          subjectId: predmet.id,
          ...hodnoty,
        });
        pridanych += 1;
        continue;
      }

      /* Ručne upravený riadok je jediná pravda o suplovaní — neprepisuje sa. */
      if (stara.manual) {
        ponechanych += 1;
        continue;
      }

      const zmenene =
        stara.startTime.slice(0, 5) !== hodnoty.startTime ||
        stara.endTime.slice(0, 5) !== hodnoty.endTime ||
        stara.teacherId !== hodnoty.teacherId ||
        stara.room !== hodnoty.room ||
        stara.groupName !== hodnoty.groupName;

      if (zmenene) {
        await db
          .update(schoolLessons)
          .set({ ...hodnoty, updatedAt: new Date() })
          .where(eq(schoolLessons.id, stara.id));
        upravenych += 1;
      }
    }

    /*
      Čo v odbere už nie je, z rozvrhu zmizne — okrem ručných riadkov. Hodina
      sa naozaj môže zrušiť a nechať ju tam by znamenalo rozvrh, ktorý klame.
    */
    const naZmazanie = buduceUlozene
      .filter((h) => !h.manual && !videne.has(kluc(h.date, h.period, h.subjectId)))
      .map((h) => h.id);

    if (naZmazanie.length > 0) {
      await db
        .delete(schoolLessons)
        .where(
          and(eq(schoolLessons.userId, user.id), inArray(schoolLessons.id, naZmazanie)),
        );
    }

    revalidateViews();

    return {
      ok: true,
      data: {
        voFeede: vsetky.length,
        mojich: moje.length,
        pridanych,
        upravenych,
        zmazanych: naZmazanie.length,
        ponechanych,
        novychPredmetov: novePredmety.length,
        novychUcitelov: noviUcitelia.length,
        deleneSkupiny: competingGroups(vsetky),
      },
    };
  } catch (error) {
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


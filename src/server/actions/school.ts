"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { schoolLessons, schoolSubjects, schoolTeachers } from "@/db/schema";
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

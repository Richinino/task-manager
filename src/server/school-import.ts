import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { schoolLessons, schoolSubjects, schoolTeachers } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import { filterByGroups, parseIcs } from "@/lib/ics";
import { uuidv7 } from "@/lib/id";
import { subjectColor } from "@/lib/school-colors";

/* ═══════════════════════════════════════════════════════════════════════════
   NAČÍTANIE ROZVRHU — SPOLOČNÉ JADRO

   Púšťa to ručný import z obrazovky aj cron, ktorý žiadne prihlásenie nemá.
   Preto sem session nechodí a používateľ príde ako obyčajný parameter — dve
   kópie tohto kódu by znamenali, že sa ručný a automatický import časom
   začnú správať inak, a to by sa prejavilo až rozdielom v rozvrhu.

   Dve pravidlá, na ktorých import stojí:

   1. **Ručne upravený riadok sa nechá tak.** Suplovanie a poznámky sú jediné,
      čo v odbere nie je; keby ich import prepísal, prvá synchronizácia by
      zmazala všetko zapísané a rozvrh by sa nedal opraviť.

   2. **Minulosť sa nemaže.** Import siaha len na dnešok a ďalej. Zmazať
      včerajšiu hodinu by znamenalo zmazať aj poznámku k nej — a tá hodina sa
      už aj tak stala.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Odber sa načítal, ale nie je v ňom ani jedna hodina. */
export class PrazdnyKalendar extends Error {
  constructor() {
    super("V kalendári nie je ani jedna hodina.");
    this.name = "PrazdnyKalendar";
  }
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
}

/**
 * Načíta rozvrh do databázy. Text sem príde už stiahnutý.
 *
 * Sťahovanie je zvlášť, aby sa dal import otestovať aj zo súboru a aby jedna
 * nedostupná adresa nezhodila celý zápis.
 */
export async function importScheduleFor(
  userId: string,
  timeZone: string,
  groups: readonly string[],
  ics: string,
): Promise<ImportSummary> {
  const vsetky = parseIcs(ics);
  if (vsetky.length === 0) throw new PrazdnyKalendar();

  const moje = filterByGroups(vsetky, groups);

  /*
    Import siaha len na dnešok a ďalej. Odber nesie aj minulosť, ale tá je
      hotová — a keby sa prepísala, zmizli by s ňou poznámky k odučeným
      hodinám.
    */
    const dnes = todayIn(timeZone);
    const buduce = moje.filter((h) => todayIn(timeZone, h.start) >= dnes);

    const db = await getDb();

    /* ── predmety a vyučujúci ───────────────────────────────────────────── */
    /*
      Pri suplovaní treba OBA predmety — ten, čo naozaj bude, aj ten, čo tu mal
      byť. Bez pôvodného by sa nedalo napísať „namiesto dejepisu".

      Cez `Set`, lebo pôvodný predmet je spravidla aj bežným predmetom inde
      v rozvrhu — dvakrát v zozname by znamenalo dva `insert` s tou istou
      skratkou a jedinečný index by to odmietol.
    */
    const predmetyVoFeede = [
      ...new Set(
        buduce.flatMap((h) =>
          h.originalSubject === null ? [h.subject] : [h.subject, h.originalSubject],
        ),
      ),
    ];
    const ucitelia = [...new Set(buduce.map((h) => h.teacher).filter((t) => t !== ""))];

    const existujucePredmety = await db
      .select()
      .from(schoolSubjects)
      .where(eq(schoolSubjects.userId, userId));
    const predmetPodlaKodu = new Map(existujucePredmety.map((p) => [p.code, p]));

    const pouziteFarby = existujucePredmety.map((p) => p.color);
    const novePredmety = predmetyVoFeede.filter((k) => !predmetPodlaKodu.has(k));

    for (const kod of novePredmety) {
      const farba = subjectColor(kod, pouziteFarby);
      pouziteFarby.push(farba);
      const id = uuidv7();
      await db
        .insert(schoolSubjects)
        .values({ id, userId: userId, code: kod, color: farba });
      predmetPodlaKodu.set(kod, {
        id,
        userId: userId,
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
      .where(eq(schoolTeachers.userId, userId));
    const ucitelPodlaKodu = new Map(existujuciUcitelia.map((u) => [u.code, u]));
    const noviUcitelia = ucitelia.filter((k) => !ucitelPodlaKodu.has(k));

    for (const kod of noviUcitelia) {
      const id = uuidv7();
      await db.insert(schoolTeachers).values({ id, userId: userId, code: kod });
      ucitelPodlaKodu.set(kod, {
        id,
        userId: userId,
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
      .where(eq(schoolLessons.userId, userId));
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
        /*
          Suplovanie zo zdroja. Keď šípka zo `SUMMARY` zmizne, pole sa vráti na
          `null` — hodina sa teda sama opraví späť, keď suplovanie odvolajú.
        */
        originalSubjectId:
          h.originalSubject === null
            ? null
            : (predmetPodlaKodu.get(h.originalSubject)?.id ?? null),
      };

      const stara = podlaKluca.get(k);

      if (stara === undefined) {
        await db.insert(schoolLessons).values({
          id: uuidv7(),
          userId: userId,
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
          and(eq(schoolLessons.userId, userId), inArray(schoolLessons.id, naZmazanie)),
        );
    }

  return {
    voFeede: vsetky.length,
    mojich: moje.length,
    pridanych,
    upravenych,
    zmazanych: naZmazanie.length,
    ponechanych,
    novychPredmetov: novePredmety.length,
    novychUcitelov: noviUcitelia.length,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STIAHNUTIE ODBERU
   ═══════════════════════════════════════════════════════════════════════════ */

/** Adresa odberu nie je nastavená, alebo z nej nič neprišlo. */
export class OdberNedostupny extends Error {
  constructor(dovod: string) {
    super(dovod);
    this.name = "OdberNedostupny";
  }
}

/** Je odber nastavený? Samotnú adresu tento modul von nikdy nevydá. */
export function maOdber(): boolean {
  return (process.env.SKOLA_ICS_URL ?? "").trim() !== "";
}

/**
 * Stiahne obsah odberu.
 *
 * Adresa je v premennej prostredia, nie v databáze — je to prístup k rozvrhu,
 * teda tajomstvo, a patrí tam, kde už je `DATABASE_URL`.
 *
 * **Do chybovej hlášky sa nedostane.** Skončila by v logoch Vercelu aj na
 * obrazovke a stačí jeden screenshot, aby bola vonku.
 */
export async function stiahniOdber(): Promise<string> {
  const raw = (process.env.SKOLA_ICS_URL ?? "").trim();
  if (raw === "") {
    throw new OdberNedostupny("Adresa odberu nie je nastavená (SKOLA_ICS_URL).");
  }

  /*
    Webcal je len iné meno pre https. EduPage adresu ponúka v tejto schéme,
    aby ju kalendárová appka chytila na kliknutie — `fetch` ju nepozná
    a spadol by na nezrozumiteľnej chybe.
  */
  const url = raw.replace(/^webcal:\/\//i, "https://");

  let odpoved: Response;
  try {
    odpoved = await fetch(url, {
      headers: { accept: "text/calendar, text/plain" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (chyba) {
    /*
      Spojenie vôbec nevzniklo — zlá adresa, spadnutý server, alebo sieť,
      z ktorej sa tam nedá dostať.

      Dôvod sa ukazuje, lebo bez neho vyzerá odmietnuté spojenie rovnako ako
      preklep v adrese a človek hľadá chybu v appke. Ide von LEN kód chyby
      (`ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT`), nikdy `cause.message` —
      ten by mohol niesť celú adresu aj s tajným kľúčom.
    */
    const kod =
      chyba instanceof Error && chyba.cause instanceof Error
        ? ((chyba.cause as { code?: string }).code ?? chyba.cause.name)
        : "neznáma chyba";

    throw new OdberNedostupny(
      "K odberu sa nepodarilo pripojiť (" +
        kod +
        "). Skús načítať súbor .ics nižšie.",
    );
  }

  if (!odpoved.ok) {
    throw new OdberNedostupny(
      "Odber odpovedal " +
        String(odpoved.status) +
        ". Skontroluj, či adresa v EduPage stále platí.",
    );
  }

  return await odpoved.text();
}


import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { schoolSubjects, users } from "@/db/schema";
import { parseSettings } from "@/lib/settings";
import {
  OdberNedostupny,
  PrazdnyKalendar,
  importScheduleFor,
  maOdber,
  stiahniOdber,
} from "@/server/school-import";

/**
 * Automatická synchronizácia rozvrhu.
 *
 * Volá to cron. Nikto tu nie je prihlásený, a preto cestu stráži to isté
 * tajomstvo ako plánovač pripomienok.
 *
 * ## Ako často
 *
 * Odber z EduPage je rozvrh natiahnutý na dátumy a **nesie aj suplovanie** —
 * ako šípku v `SUMMARY` (`DEJ -> SJL`). Zmena na dnešok sa preto dá chytiť
 * ešte v ten deň, keď sa odber stiahne aj cez vyučovanie. Hlavný plánovač
 * (externý cron) volá túto cestu každú hodinu cez školský deň; GitHub
 * workflow je záloha. Podrobnosti v `docs/NASADENIE.md`.
 *
 * ## Komu sa rozvrh načíta
 *
 * Adresa odberu je **jedna, globálna** premenná prostredia — patrí jednému
 * človeku. Route preto hľadá toho, kto si rozvrh už raz načítal ručne, teda
 * má predmety. Vtedy má vybraté aj skupiny, bez ktorých by import stiahol
 * dvojité okienka celej triedy.
 *
 * Keď takých ľudí nájde viac, **radšej neurobí nič**: nedá sa uhádnuť, komu
 * ten odber patrí, a natiahnuť cudzí rozvrh je horšie než ho nenatiahnuť.
 */

/** Beží za behu, nikdy sa neprerenderuje dopredu. */
export const dynamic = "force-dynamic";

/** Stiahnutie aj zápis vyše štyristo hodín sa do desiatich sekúnd nezmestí. */
export const maxDuration = 60;

function neopravneny(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}

function odpoved(telo: unknown, status = 200): Response {
  return Response.json(telo, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();

  /*
    Bez tajomstva je cesta zatvorená. Nechať ju otvorenú „kým sa nenastaví"
    by znamenalo, že ktokoľvek vie appke povedať, nech ťahá odber donekonečna.
  */
  if (!secret) return neopravneny();
  if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return neopravneny();
  }

  if (!maOdber()) {
    console.warn("[api/rozvrh] SKOLA_ICS_URL nie je nastavená.");
    return odpoved({ ok: false, dovod: "SKOLA_ICS_URL nie je nastavená." }, 503);
  }

  const db = await getDb();

  /*
    Kto si rozvrh už raz načítal. `select distinct` cez predmety — kto ich má,
    ten prešiel ručným importom, a teda má aj vybraté skupiny.
  */
  const majuRozvrh = await db
    .selectDistinct({ userId: schoolSubjects.userId })
    .from(schoolSubjects);

  if (majuRozvrh.length === 0) {
    console.warn("[api/rozvrh] Rozvrh si ešte nikto nenačítal — cron nemá komu.");
    return odpoved({
      ok: false,
      dovod: "Rozvrh si ešte nikto nenačítal — prvý import treba spraviť ručne.",
    });
  }

  if (majuRozvrh.length > 1) {
    console.warn("[api/rozvrh] Rozvrh má viac ľudí, adresa odberu je jedna — nič sa nesťahuje.");
    return odpoved(
      {
        ok: false,
        dovod:
          "Rozvrh má viac ľudí, ale adresa odberu je jedna. " +
          "Nedá sa uhádnuť, komu patrí.",
      },
      409,
    );
  }

  const userId = majuRozvrh[0]!.userId;

  const riadky = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const nastavenia = parseSettings(riadky[0]?.settings);

  try {
    const summary = await importScheduleFor(
      userId,
      nastavenia.timezone,
      nastavenia.schoolGroups,
      await stiahniOdber(),
    );

    /*
      Obrazovky, na ktorých je rozvrh vidieť — aj písomky, ktoré import
      posunul za hodinou. Bez toho by človek videl starý stav až do
      najbližšieho tvrdého načítania stránky.
    */
    for (const cesta of ["/rozvrh", "/dnes", "/tyzden", "/udalosti", "/mesiac"]) revalidatePath(cesta);

    console.info("[api/rozvrh] Rozvrh stiahnutý", summary);
    return odpoved({ ok: true, ...summary });
  } catch (chyba) {
    /*
      Dôvod ide do logu Vercelu aj do odpovede — tú si pamätá história
      cron-job.org dlhšie, než Vercel drží logy. V detaile nie je adresa
      odberu (`DetailOdberu`).
    */
    if (chyba instanceof OdberNedostupny) {
      console.warn("[api/rozvrh] Odber nedostupný:", chyba.message, chyba.detail);
      return odpoved({ ok: false, dovod: chyba.message, detail: chyba.detail }, 502);
    }
    if (chyba instanceof PrazdnyKalendar) {
      console.warn("[api/rozvrh] V odbere nie je ani jedna hodina.");
      return odpoved({ ok: false, dovod: "V odbere nie je ani jedna hodina." }, 502);
    }

    console.error("[api/rozvrh] Synchronizácia zlyhala", chyba);
    return odpoved({ ok: false, dovod: "Synchronizácia zlyhala." }, 500);
  }
}

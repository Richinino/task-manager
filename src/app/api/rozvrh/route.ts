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
 * ## Prečo netreba často
 *
 * Odber z EduPage je **rozvrh natiahnutý na dátumy, nie denný plán** —
 * suplovanie v ňom nie je. Meniť sa teda má čo raz za čas: nové okno troch
 * mesiacov dopredu, zmena rozvrhu na polrok. **Raz denne bohato stačí** a
 * častejšie behy by len ťahali ten istý súbor.
 *
 * (Keby raz suplovanie prišlo z iného zdroja, ten bude potrebovať vlastnú
 * kadenciu — nie túto.)
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
    return odpoved({
      ok: false,
      dovod: "Rozvrh si ešte nikto nenačítal — prvý import treba spraviť ručne.",
    });
  }

  if (majuRozvrh.length > 1) {
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
      Obrazovky, na ktorých je rozvrh vidieť. Bez toho by človek videl starý
      rozvrh až do najbližšieho tvrdého načítania stránky.
    */
    for (const cesta of ["/rozvrh", "/dnes", "/tyzden"]) revalidatePath(cesta);

    return odpoved({ ok: true, ...summary });
  } catch (chyba) {
    if (chyba instanceof OdberNedostupny) {
      return odpoved({ ok: false, dovod: chyba.message }, 502);
    }
    if (chyba instanceof PrazdnyKalendar) {
      return odpoved({ ok: false, dovod: "V odbere nie je ani jedna hodina." }, 502);
    }

    console.error("[api/rozvrh] Synchronizácia zlyhala", chyba);
    return odpoved({ ok: false, dovod: "Synchronizácia zlyhala." }, 500);
  }
}

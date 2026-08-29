import { and, eq, gte, isNotNull, lte, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { pushSubscriptions, reminders, tasks, users } from "@/db/schema";
import { addDays, todayIn } from "@/lib/dates";
import { buildPushPayload } from "@/lib/push-payload";
import {
  MAX_MESKANIE_MIN,
  MAX_NA_BEH,
  casPripomienky,
  jeNaOdoslanie,
} from "@/lib/reminders";
import { parseSettings } from "@/lib/settings";
import { uuidv7 } from "@/lib/id";
import { isPushConfigured, sendPush } from "@/server/push";

/**
 * Plánovač pripomienok — jediné miesto, ktoré notifikácie naozaj odosiela.
 *
 * Volá ho cron v GitHub Actions každých 15 minút. Nie je to používateľská
 * cesta: nikto tu nie je prihlásený, a preto ju stráži tajomstvo v hlavičke.
 *
 * ## Prečo sa pripomienky nevytvárajú vopred
 *
 * Tabuľka `reminders` neslúži ako fronta, ale ako **záznam o odoslanom**.
 * Čas pripomienky sa počíta z úlohy pri každom behu; riadok vznikne až vo
 * chvíli, keď notifikácia odíde.
 *
 * Má to jeden konkrétny dôsledok, kvôli ktorému je to takto: keď úlohu
 * presunieš, zmení sa jej čas — a tým aj `at`. Nová dvojica (úloha, okamih)
 * v tabuľke nie je, takže pripomienka na nový čas normálne príde. Keby sa
 * riadky vytvárali vopred, musel by ich každý presun úlohy prepisovať a
 * jedno zabudnuté miesto by znamenalo notifikáciu na starý čas.
 *
 * Jedinečný index na (`task_id`, `at`) je poistka proti dvom behom naraz.
 *
 * ## Radšej neskoro než skoro
 *
 * Berú sa len pripomienky, ktoré už dozreli. Meškanie je teda do štvrť
 * hodiny, ale nikdy neprídu skôr — podrobnosti v `src/lib/reminders.ts`.
 */

/** Beží za behu, nikdy sa neprerenderuje dopredu. */
export const dynamic = "force-dynamic";

/** Aby dlhší beh nezhodila predvolená hranica funkcie. */
export const maxDuration = 60;

interface Suhrn {
  preverenych: number;
  odoslanych: number;
  zlyhani: number;
  zmazanychPrihlaseni: number;
  /**
   * Koľko pripomienok už bolo pristarých na odoslanie.
   *
   * Nie je to detail do štatistiky — je to jediná stopa po notifikácii,
   * ktorá nikdy nepríde. Bez tohto čísla vyzerá zahodená pripomienka
   * úplne rovnako ako neexistujúca (`odoslanych: 0`) a nedá sa rozoznať
   * „nebolo čo poslať" od „plánovač spal a zmeškal to".
   */
  zahodenychStarych: number;
}

function neopravneny(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();

  /*
    Bez tajomstva je cesta zatvorená. Nechať ju otvorenú „kým sa nenastaví"
    by znamenalo, že ktokoľvek vie appke povedať, nech rozpošle notifikácie.
  */
  if (!secret) return neopravneny();

  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) return neopravneny();

  if (!isPushConfigured()) {
    return Response.json(
      { ok: false, dovod: "Kľúče VAPID nie sú nastavené." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const teraz = new Date();
  const db = await getDb();

  /*
    Okno dvoch dní okolo dneška v UTC. Presný deň sa počíta až v pásme
    používateľa, ale bez tohto orezania by dopyt prešiel celú tabuľku.
    Dva dni pokryjú aj +14 a −12 hodín posunu.
  */
  const dnesUtc = todayIn("UTC", teraz);
  const odDna = addDays(dnesUtc, -1);
  const doDna = addDays(dnesUtc, 1);

  /*
    bez-filtra: plánovač beží bez prihláseného človeka a musí obslúžiť
    všetkých. Cudzie riadky sa nikam nevydávajú — každá notifikácia ide
    výhradne na prihlásenia toho istého `userId`, z ktorého úloha pochádza.
  */
  const kandidati = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      title: tasks.title,
      plannedDate: tasks.plannedDate,
      plannedTime: tasks.plannedTime,
      dueDate: tasks.dueDate,
      dueTime: tasks.dueTime,
      estimateMin: tasks.estimateMin,
      settings: users.settings,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(
      and(
        ne(tasks.status, "done"),
        ne(tasks.status, "dropped"),
        sql`${tasks.deletedAt} is null`,
        // Bez hodiny sa pripomínať nedá — polnoc nie je čas na vyrušenie.
        or(isNotNull(tasks.plannedTime), isNotNull(tasks.dueTime)),
        or(
          and(gte(tasks.plannedDate, odDna), lte(tasks.plannedDate, doDna)),
          and(gte(tasks.dueDate, odDna), lte(tasks.dueDate, doDna)),
        ),
      ),
    )
    .limit(500);

  const suhrn: Suhrn = {
    preverenych: kandidati.length,
    odoslanych: 0,
    zlyhani: 0,
    zmazanychPrihlaseni: 0,
    zahodenychStarych: 0,
  };

  /** Prihlásenia si držíme na používateľa, nie na úlohu. */
  const prihlaseniaPodlaLudi = new Map<
    string,
    { endpoint: string; p256dh: string; auth: string }[]
  >();

  for (const uloha of kandidati) {
    if (suhrn.odoslanych >= MAX_NA_BEH) break;

    const settings = parseSettings(uloha.settings);
    const at = casPripomienky(
      {
        plannedDate: uloha.plannedDate,
        plannedTime: uloha.plannedTime,
        dueDate: uloha.dueDate,
        dueTime: uloha.dueTime,
      },
      settings.timezone,
      settings.reminderLeadMin,
    );
    if (at === null) continue;

    // Rovnaké pravidlo ako v `src/lib/reminders.ts` — dozretá a nie stará.
    if (!jeNaOdoslanie({ id: uloha.id, at, sentAt: null }, teraz, MAX_MESKANIE_MIN)) {
      /*
        Rozlíšime dva dôvody, ktoré vyzerajú rovnako, ale znamenajú niečo
        úplne iné: pripomienka, ktorá ešte nedozrela, príde nabudúce —
        pristará už nepríde nikdy. To druhé je porucha plánovača a musí
        byť v súhrne vidno.
      */
      if (at.getTime() <= teraz.getTime()) suhrn.zahodenychStarych += 1;
      continue;
    }

    /*
      Riadok sa zapíše PRED odoslaním. Keby sa zapisoval až po ňom a beh by
      medzitým spadol, notifikácia by odišla a pri ďalšom behu znova.
      Jedinečný index navyše zaručí, že súbežný beh tú istú dvojicu
      nevloží druhýkrát — a keď ju nevložil, ani neposiela.
    */
    const vlozene = await db
      .insert(reminders)
      .values({
        id: uuidv7(),
        userId: uloha.userId,
        taskId: uloha.id,
        at,
        sentAt: teraz,
      })
      /*
        Bez cieľa zámerne — táto verzia Drizzle argument neberie a robí to
        isté: `id` je čerstvé uuidv7, takže jediný unikát, na ktorom sa dá
        naraziť, je práve dvojica (úloha, okamih).
      */
      .onConflictDoNothing()
      // Stačí vedieť, či riadok vznikol — obsah sa nepoužije.
      .returning();

    if (vlozene.length === 0) continue;

    let prihlasenia = prihlaseniaPodlaLudi.get(uloha.userId);
    if (prihlasenia === undefined) {
      prihlasenia = await db
        .select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, uloha.userId));
      prihlaseniaPodlaLudi.set(uloha.userId, prihlasenia);
    }

    if (prihlasenia.length === 0) continue;

    const payload = buildPushPayload({
      id: uloha.id,
      title: uloha.title,
      time: uloha.plannedTime ?? uloha.dueTime,
      estimateMin: uloha.estimateMin,
      leadMin: settings.reminderLeadMin,
    });

    for (const prihlasenie of prihlasenia) {
      const vysledok = await sendPush(prihlasenie, payload);

      if (vysledok.ok) {
        suhrn.odoslanych += 1;
        await db
          .update(pushSubscriptions)
          .set({ lastSeenAt: teraz })
          .where(eq(pushSubscriptions.endpoint, prihlasenie.endpoint));
        continue;
      }

      suhrn.zlyhani += 1;

      /*
        Mŕtve prihlásenie ide von. Bez toho by si ho plánovač vypýtal pri
        každom behu a pri každom behu by mu push služba odpovedala 410.
      */
      if (vysledok.gone) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, prihlasenie.endpoint));
        suhrn.zmazanychPrihlaseni += 1;
        prihlaseniaPodlaLudi.set(
          uloha.userId,
          prihlasenia.filter((p) => p.endpoint !== prihlasenie.endpoint),
        );
      }
    }
  }

  return Response.json(
    { ok: true, ...suhrn },
    { headers: { "Cache-Control": "no-store" } },
  );
}

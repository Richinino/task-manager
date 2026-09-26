import { and, eq, gte, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  agendaItems,
  agendaReminders,
  pushSubscriptions,
  reminders,
  schoolSubjects,
  tasks,
  users,
} from "@/db/schema";
import { isAgendaReminder } from "@/lib/agenda";
import {
  agendaReminderAt,
  agendaReminderPayload,
  prepReminderAt,
  prepReminderPayload,
} from "@/lib/agenda-reminders";
import { addDays, todayIn } from "@/lib/dates";
import { buildPushPayload, type PushPayload } from "@/lib/push-payload";
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
 * ## Tri druhy pripomienok
 *
 * 1. **Úloha s hodinou** — naplánovaný čas alebo termín mínus predstih.
 * 2. **Udalosť** so zapnutou pripomienkou — večer vopred, ráno, alebo
 *    hodinu vopred (`src/lib/agenda-reminders.ts`). Záznam o odoslanom je
 *    v `agenda_reminders`.
 * 3. **Deň prípravy** — ráno v deň, na ktorý je naplánovaná úloha pod
 *    udalosťou so zapnutou pripomienkou. Je to pripomienka úlohy, takže
 *    záznam ide do `reminders` ako pri bode 1.
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

  /**
   * Pošle notifikáciu na všetky prihlásenia človeka.
   *
   * Prihlásenia sa pýtajú raz na človeka, nie na pripomienku. Mŕtve
   * prihlásenie ide von — bez toho by si ho plánovač vypýtal pri každom behu
   * a pri každom behu by mu push služba odpovedala 410.
   */
  async function dorucit(userId: string, payload: PushPayload): Promise<void> {
    let prihlasenia = prihlaseniaPodlaLudi.get(userId);
    if (prihlasenia === undefined) {
      prihlasenia = await db
        .select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      prihlaseniaPodlaLudi.set(userId, prihlasenia);
    }

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
      if (vysledok.gone) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, prihlasenie.endpoint));
        suhrn.zmazanychPrihlaseni += 1;
        prihlaseniaPodlaLudi.set(
          userId,
          (prihlaseniaPodlaLudi.get(userId) ?? []).filter((p) => p.endpoint !== prihlasenie.endpoint),
        );
      }
    }
  }

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

    await dorucit(
      uloha.userId,
      buildPushPayload({
        id: uloha.id,
        title: uloha.title,
        time: uloha.plannedTime ?? uloha.dueTime,
        estimateMin: uloha.estimateMin,
        leadMin: settings.reminderLeadMin,
      }),
    );
  }

  /* ── Udalosti ────────────────────────────────────────────────────────────
     Okno o deň širšie dopredu: „večer vopred" zvoní deň pred udalosťou.   */
  const doDnaUdalosti = addDays(doDna, 1);

  /*
    bez-filtra: plánovač obsluhuje všetkých; notifikácia ide výhradne na
    prihlásenia vlastníka udalosti (`userId` z toho istého riadka).
  */
  const udalosti = await db
    .select({
      id: agendaItems.id,
      userId: agendaItems.userId,
      kind: agendaItems.kind,
      type: agendaItems.type,
      title: agendaItems.title,
      date: agendaItems.date,
      endDate: agendaItems.endDate,
      startTime: agendaItems.startTime,
      endTime: agendaItems.endTime,
      period: agendaItems.period,
      place: agendaItems.place,
      remind: agendaItems.remind,
      createdAt: agendaItems.createdAt,
      subjectCode: schoolSubjects.code,
      settings: users.settings,
    })
    .from(agendaItems)
    .innerJoin(users, eq(agendaItems.userId, users.id))
    .leftJoin(schoolSubjects, eq(schoolSubjects.id, agendaItems.subjectId))
    .where(
      and(
        isNotNull(agendaItems.remind),
        isNull(agendaItems.cancelledAt),
        isNull(agendaItems.deletedAt),
        gte(agendaItems.date, odDna),
        lte(agendaItems.date, doDnaUdalosti),
      ),
    )
    .limit(500);
  suhrn.preverenych += udalosti.length;

  for (const udalost of udalosti) {
    if (suhrn.odoslanych >= MAX_NA_BEH) break;
    if (!isAgendaReminder(udalost.remind)) continue;

    const settings = parseSettings(udalost.settings);
    const at = agendaReminderAt(udalost, udalost.remind, settings.timezone);
    if (at === null || !jeNaOdoslanie({ id: udalost.id, at, sentAt: null }, teraz, MAX_MESKANIE_MIN)) {
      continue;
    }
    /*
      Udalosť zapísaná až po čase pripomienky (písomka na zajtra zapísaná
      o deviatej večer) ju nedostane — človek o nej práve vie, notifikácia
      o päť minút by bola len šum.
    */
    if (udalost.createdAt.getTime() > at.getTime()) continue;

    const vlozene = await db
      .insert(agendaReminders)
      .values({ id: uuidv7(), userId: udalost.userId, agendaItemId: udalost.id, at, sentAt: teraz })
      .onConflictDoNothing()
      .returning();
    if (vlozene.length === 0) continue;

    const [postup] = await db
      .select({
        total: sql<number>`cast(count(*) as int)`,
        done: sql<number>`cast(count(*) filter (where ${tasks.status} = 'done') as int)`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, udalost.userId),
          eq(tasks.agendaItemId, udalost.id),
          isNull(tasks.deletedAt),
          ne(tasks.status, "dropped"),
        ),
      );

    await dorucit(
      udalost.userId,
      agendaReminderPayload(udalost, udalost.remind, {
        id: udalost.id,
        subjectCode: udalost.subjectCode,
        place: udalost.place,
        progress: { done: Number(postup?.done ?? 0), total: Number(postup?.total ?? 0) },
      }),
    );
  }

  /* ── Dni prípravy ────────────────────────────────────────────────────────
     Ráno v deň úlohy pod udalosťou so zapnutou pripomienkou. Úloha s vlastnou
     hodinou ju nedostane — tú pripomenie jej hodina (bod 1).              */

  /*
    bez-filtra: plánovač obsluhuje všetkých; úloha a udalosť patria tomu
    istému človeku (podmienka nižšie) a notifikácia ide len jemu.
  */
  const priprava = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      title: tasks.title,
      plannedDate: tasks.plannedDate,
      estimateMin: tasks.estimateMin,
      createdAt: tasks.createdAt,
      itemId: agendaItems.id,
      kind: agendaItems.kind,
      type: agendaItems.type,
      itemTitle: agendaItems.title,
      date: agendaItems.date,
      endDate: agendaItems.endDate,
      startTime: agendaItems.startTime,
      endTime: agendaItems.endTime,
      period: agendaItems.period,
      subjectCode: schoolSubjects.code,
      settings: users.settings,
    })
    .from(tasks)
    .innerJoin(agendaItems, eq(tasks.agendaItemId, agendaItems.id))
    .innerJoin(users, eq(tasks.userId, users.id))
    .leftJoin(schoolSubjects, eq(schoolSubjects.id, agendaItems.subjectId))
    .where(
      and(
        eq(tasks.userId, agendaItems.userId),
        isNotNull(agendaItems.remind),
        isNull(agendaItems.cancelledAt),
        isNull(agendaItems.deletedAt),
        isNull(tasks.deletedAt),
        ne(tasks.status, "done"),
        ne(tasks.status, "dropped"),
        isNull(tasks.plannedTime),
        gte(tasks.plannedDate, odDna),
        lte(tasks.plannedDate, doDna),
        sql`${tasks.plannedDate} < ${agendaItems.date}`,
      ),
    )
    .limit(500);
  suhrn.preverenych += priprava.length;

  for (const uloha of priprava) {
    if (suhrn.odoslanych >= MAX_NA_BEH) break;
    if (uloha.plannedDate === null) continue;

    const settings = parseSettings(uloha.settings);
    const at = prepReminderAt(uloha.plannedDate, settings.timezone);
    if (at === null || !jeNaOdoslanie({ id: uloha.id, at, sentAt: null }, teraz, MAX_MESKANIE_MIN)) {
      continue;
    }
    // Prípravu pridanú až dnes doobeda netreba ohlasovať — človek ju práve pridal.
    if (uloha.createdAt.getTime() > at.getTime()) continue;

    const vlozene = await db
      .insert(reminders)
      .values({ id: uuidv7(), userId: uloha.userId, taskId: uloha.id, at, sentAt: teraz })
      .onConflictDoNothing()
      .returning();
    if (vlozene.length === 0) continue;

    await dorucit(
      uloha.userId,
      prepReminderPayload({
        taskId: uloha.id,
        taskTitle: uloha.title,
        estimateMin: uloha.estimateMin,
        plannedDate: uloha.plannedDate,
        item: {
          id: uloha.itemId,
          kind: uloha.kind,
          type: uloha.type,
          title: uloha.itemTitle,
          date: uloha.date,
          endDate: uloha.endDate,
          startTime: uloha.startTime,
          endTime: uloha.endTime,
          period: uloha.period,
        },
        subjectCode: uloha.subjectCode,
      }),
    );
  }

  return Response.json(
    { ok: true, ...suhrn },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  agendaItems,
  agendaReminders,
  dailyPushes,
  focusSessions,
  pushSubscriptions,
  reminders,
  schoolBreaks,
  schoolLessons,
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
import {
  AFTER_SCHOOL_KEY,
  AFTER_SCHOOL_WINDOW_MIN,
  EXAM_EVENING_WINDOW_MIN,
  afterSchoolPayload,
  afterSchoolSendMinute,
  examEveningKey,
  examEveningMinute,
  examEveningPayload,
  isWithinWindow,
  pickStartTask,
} from "@/lib/daily-push";
import { addDays, minutesIn, todayIn } from "@/lib/dates";
import { DEFAULT_FOCUS_MIN, spentMinutes } from "@/lib/focus";
import { decideFocusNotify, focusEndPayload } from "@/lib/focus-push";
import { isSchoolBreak } from "@/lib/school";
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
 * ## Štyri druhy pripomienok
 *
 * 1. **Úloha s hodinou** — naplánovaný čas alebo termín mínus predstih.
 * 2. **Udalosť** so zapnutou pripomienkou — večer vopred, ráno, alebo
 *    hodinu vopred (`src/lib/agenda-reminders.ts`). Záznam o odoslanom je
 *    v `agenda_reminders`.
 * 3. **Deň prípravy** — ráno v deň, na ktorý je naplánovaná úloha pod
 *    udalosťou so zapnutou pripomienkou. Je to pripomienka úlohy, takže
 *    záznam ide do `reminders` ako pri bode 1.
 * 4. **Fokus vypršal** — odhad bežiaceho fokusu sa minul. Najviac jedna
 *    notifikácia na `plannedEndAt`: stráži to `focus_sessions.notified_at`,
 *    ktorý sa nastavuje atomicky PRED odoslaním (pozri nižšie).
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
  /** Fokus: odhad vypršal a notifikácia odišla (aspoň na jedno prihlásenie). */
  fokusOznamenych: number;
  /** Fokus: pristará relácia — označená, nič sa neposlalo (pozri `FOCUS_MAX_MESKANIE_MIN`). */
  fokusZahodenych: number;
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
    fokusOznamenych: 0,
    fokusZahodenych: 0,
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
  async function nacitatPrihlasenia(userId: string) {
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
    return prihlasenia;
  }

  async function dorucit(userId: string, payload: PushPayload): Promise<void> {
    const prihlasenia = await nacitatPrihlasenia(userId);

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

  /* ── Denné notifikácie ───────────────────────────────────────────────────
     Zhrnutie „po škole" a upozornenie večer pred písomkou. Idú najviac raz
     za deň — stráži to `daily_pushes`, riadok sa vkladá PRED odoslaním.   */

  /*
    bez-filtra: plánovač obsluhuje všetkých; berú sa len ľudia s aspoň jedným
    prihlásením na notifikácie a všetko ďalej sa pýta s ich `userId`.
  */
  const adresati = await db
    .selectDistinct({ userId: pushSubscriptions.userId, settings: users.settings })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .limit(200);
  suhrn.preverenych += adresati.length;

  /** Vloží záznam o dennej notifikácii; `false`, keď už existuje. */
  async function zapisatDennu(userId: string, den: string, kluc: string): Promise<boolean> {
    const vlozene = await db
      .insert(dailyPushes)
      .values({ id: uuidv7(), userId, date: den, key: kluc, sentAt: teraz })
      .onConflictDoNothing()
      .returning();
    return vlozene.length > 0;
  }

  for (const clovek of adresati) {
    if (suhrn.odoslanych >= MAX_NA_BEH) break;

    const settings = parseSettings(clovek.settings);
    const dnes = todayIn(settings.timezone, teraz);
    const minuta = minutesIn(settings.timezone, teraz);

    /* Zhrnutie po škole. */
    if (settings.afterSchoolSummary) {
      const [uzOdoslane] = await db
        .select({ id: dailyPushes.id })
        .from(dailyPushes)
        .where(
          and(
            eq(dailyPushes.userId, clovek.userId),
            eq(dailyPushes.date, dnes),
            eq(dailyPushes.key, AFTER_SCHOOL_KEY),
          ),
        )
        .limit(1);

      if (!uzOdoslane) {
        const volna = await db
          .select({ fromDate: schoolBreaks.fromDate, toDate: schoolBreaks.toDate })
          .from(schoolBreaks)
          .where(
            and(
              eq(schoolBreaks.userId, clovek.userId),
              lte(schoolBreaks.fromDate, dnes),
              gte(schoolBreaks.toDate, dnes),
            ),
          );
        const hodiny = await db
          .select({ endTime: schoolLessons.endTime, cancelled: schoolLessons.cancelled })
          .from(schoolLessons)
          .where(and(eq(schoolLessons.userId, clovek.userId), eq(schoolLessons.date, dnes)));

        const odKedy = afterSchoolSendMinute(
          hodiny,
          !isSchoolBreak(dnes, volna),
          settings.summaryFallbackAt,
        );

        if (odKedy !== null && isWithinWindow(minuta, odKedy, AFTER_SCHOOL_WINDOW_MIN)) {
          // Otvorené: naplánované na dnes alebo po termíne naplánovania.
          const otvorene = await db
            .select({
              id: tasks.id,
              title: tasks.title,
              isFrog: tasks.isFrog,
              plannedDate: tasks.plannedDate,
            })
            .from(tasks)
            .where(
              and(
                eq(tasks.userId, clovek.userId),
                ne(tasks.status, "done"),
                ne(tasks.status, "dropped"),
                isNull(tasks.deletedAt),
                lte(tasks.plannedDate, dnes),
              ),
            )
            .orderBy(asc(tasks.priority), asc(tasks.sort), asc(tasks.createdAt))
            .limit(200);

          const prva = pickStartTask(otvorene, dnes);
          if (prva !== null && (await zapisatDennu(clovek.userId, dnes, AFTER_SCHOOL_KEY))) {
            await dorucit(clovek.userId, afterSchoolPayload(otvorene.length, prva));
          }
        }
      }
    }

    if (suhrn.odoslanych >= MAX_NA_BEH) break;

    /* Večer pred písomkou alebo skúšaním — len bez vlastnej pripomienky. */
    if (settings.examEveningPush && isWithinWindow(minuta, examEveningMinute(), EXAM_EVENING_WINDOW_MIN)) {
      const zajtra = addDays(dnes, 1);
      const pisomky = await db
        .select({
          id: agendaItems.id,
          type: agendaItems.type,
          title: agendaItems.title,
          subjectCode: schoolSubjects.code,
        })
        .from(agendaItems)
        .leftJoin(schoolSubjects, eq(schoolSubjects.id, agendaItems.subjectId))
        .where(
          and(
            eq(agendaItems.userId, clovek.userId),
            eq(agendaItems.date, zajtra),
            inArray(agendaItems.type, ["exam", "oral"]),
            isNull(agendaItems.remind),
            isNull(agendaItems.cancelledAt),
            isNull(agendaItems.deletedAt),
          ),
        )
        .limit(10);

      for (const pisomka of pisomky) {
        if (suhrn.odoslanych >= MAX_NA_BEH) break;
        if (pisomka.type !== "exam" && pisomka.type !== "oral") continue;

        if (!(await zapisatDennu(clovek.userId, dnes, examEveningKey(pisomka.id)))) continue;

        const priprava = await db
          .select({ estimateMin: tasks.estimateMin })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, clovek.userId),
              eq(tasks.agendaItemId, pisomka.id),
              isNull(tasks.deletedAt),
              ne(tasks.status, "done"),
              ne(tasks.status, "dropped"),
            ),
          );

        await dorucit(
          clovek.userId,
          examEveningPayload({
            id: pisomka.id,
            type: pisomka.type,
            subject: pisomka.subjectCode ?? pisomka.title,
            prep: priprava,
          }),
        );
      }
    }
  }

  /* ── Fokus vypršal ───────────────────────────────────────────────────────
     Bežiaci fokus, ktorému sa minul odhad. Jedna notifikácia na `plannedEndAt`
     — „+15 min" v appke `notified_at` maže, takže nový koniec smie zazvoniť
     raz znova.                                                             */

  /*
    bez-filtra: plánovač obsluhuje všetkých; notifikácia ide len na
    prihlásenia vlastníka relácie (`userId` z toho istého riadka) a úloha
    sa páruje s reláciou toho istého človeka.
  */
  const fokusy = await db
    .select({
      id: focusSessions.id,
      userId: focusSessions.userId,
      taskId: focusSessions.taskId,
      startedAt: focusSessions.startedAt,
      plannedEndAt: focusSessions.plannedEndAt,
      title: tasks.title,
      estimateMin: tasks.estimateMin,
    })
    .from(focusSessions)
    .innerJoin(
      tasks,
      and(eq(tasks.id, focusSessions.taskId), eq(tasks.userId, focusSessions.userId)),
    )
    .where(
      and(
        isNull(focusSessions.endedAt),
        isNull(focusSessions.notifiedAt),
        lte(focusSessions.plannedEndAt, teraz),
        isNull(tasks.deletedAt),
        ne(tasks.status, "done"),
        ne(tasks.status, "dropped"),
      ),
    )
    .limit(100);
  suhrn.preverenych += fokusy.length;

  for (const fokus of fokusy) {
    if (suhrn.odoslanych >= MAX_NA_BEH) break;

    const rozhodnutie = decideFocusNotify(
      { endedAt: null, notifiedAt: null, plannedEndAt: fokus.plannedEndAt },
      teraz,
    );
    if (rozhodnutie === "preskocit") continue;

    /*
      Bez prihlásenia nie je komu poslať — a relácia sa NErezervuje, aby
      klient (otvorená appka) mohol ešte ukázať vlastnú notifikáciu.
    */
    if (rozhodnutie === "poslat" && (await nacitatPrihlasenia(fokus.userId)).length === 0) continue;

    /*
      Rezervácia: jediný UPDATE s podmienkou `notified_at is null` je
      atomický, takže dva súbežné behy (alebo beh a `markFocusNotified`
      z appky) nemôžu notifikáciu poslať obaja — vyhrá ten, komu `returning`
      vráti riadok. `planned_end_at = <načítaný>` navyše zaručí, že
      „+15 min" medzi načítaním a rezerváciou nezhodí notifikáciu na starý
      koniec. Pristará relácia sa označí tiež (a nič sa nepošle), inak by sa
      pri každom behu skúšala znova.
    */
    const rezervovane = await db
      .update(focusSessions)
      .set({ notifiedAt: teraz })
      .where(
        and(
          eq(focusSessions.id, fokus.id),
          eq(focusSessions.userId, fokus.userId),
          isNull(focusSessions.endedAt),
          isNull(focusSessions.notifiedAt),
          eq(focusSessions.plannedEndAt, fokus.plannedEndAt),
        ),
      )
      .returning();
    if (rezervovane.length === 0) continue;

    if (rozhodnutie === "zahodit") {
      suhrn.fokusZahodenych += 1;
      continue;
    }

    const useky = await db
      .select({ startedAt: focusSessions.startedAt, endedAt: focusSessions.endedAt })
      .from(focusSessions)
      .where(and(eq(focusSessions.userId, fokus.userId), eq(focusSessions.taskId, fokus.taskId)));

    const odoslaneDoteraz = suhrn.odoslanych;
    await dorucit(
      fokus.userId,
      focusEndPayload({
        taskId: fokus.taskId,
        title: fokus.title,
        plannedMin: fokus.estimateMin ?? DEFAULT_FOCUS_MIN,
        spentMin: spentMinutes(useky, teraz),
      }),
    );
    if (suhrn.odoslanych > odoslaneDoteraz) suhrn.fokusOznamenych += 1;
  }

  return Response.json(
    { ok: true, ...suhrn },
    { headers: { "Cache-Control": "no-store" } },
  );
}

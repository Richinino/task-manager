import type { Metadata } from "next";

import { DayHeader } from "@/components/views/dnes/day-header";
import { DayList } from "@/components/views/dnes/day-list";
import { AreasToday } from "@/components/views/dnes/areas-today";
import { DayHabits } from "@/components/views/dnes/day-habits";
import { DayMeetings } from "@/components/views/dnes/day-meetings";
import { LiveBudgetPanel } from "@/components/views/dnes/live-budget-panel";
import { DayFooter } from "@/components/views/dnes/day-footer";
import { DayRail } from "@/components/views/dnes/day-rail";
import { DayRituals } from "@/components/views/dnes/day-rituals";
import { DayPriorityCard } from "@/components/views/dnes/day-priority-card";
import { OverdueSection } from "@/components/views/dnes/overdue-section";
import { LiveTimeBudget } from "@/components/views/dnes/live-time-budget";
import { WhatNow } from "@/components/views/dnes/what-now";
import { RitualHost } from "@/components/rituals/ritual-host";
import { parseIsoDate, startOfWeek, todayIn, toIsoDate } from "@/lib/dates";
import { listHabits } from "@/server/queries/habits";
import { ritualPeriod } from "@/lib/rituals";
import { requireUser } from "@/server/auth-guard";
import {
  getActionableTasks,
  getOverdueTasks,
  getTasksForDay,
  listContexts,
} from "@/server/queries/tasks";
import { getJournalEntry, getRitualState } from "@/server/queries/rituals";
import { getDayEvents, meetingMinutes } from "@/server/queries/calendar";

export const metadata: Metadata = {
  title: "Dnes",
};

/**
 * Obrazovka „Dnes" — prvá vec, ktorú človek ráno vidí.
 *
 * Zhora nadol: dátum a rozpočet času → priorita dňa → čo horí (po termíne) →
 * dnešné úlohy. Poradie je zámerné: najprv záväzok, potom dlh, až potom zoznam.
 */
interface DnesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Zobrazovaný deň z `?den=RRRR-MM-DD`.
 *
 * Rovnaká kontrola ako v týždennom pohľade: `2026-02-31` prejde regulárnym
 * výrazom, ale po prevode tam a späť vyjde iný deň, takže sa zahodí.
 */
function readDay(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === "") return null;
  const parsed = parseIsoDate(raw);
  return toIsoDate(parsed) === raw ? raw : null;
}

export default async function DnesPage({ searchParams }: DnesPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  // Dnešok berieme z pásma používateľa, nie z pásma procesu — na Verceli (UTC)
  // by inak medzi polnocou a druhou v noci svietili včerajšie úlohy.
  const todayIso = todayIn(user.settings.timezone);
  const date = readDay(params["den"]) ?? todayIso;
  const isToday = date === todayIso;

  // Denné rituály zdieľajú obdobie — pre oba je to dnešok.
  const dailyPeriod = ritualPeriod("daily_shutdown", date, user.settings.weekStartsOn);

  const [
    planned,
    overdue,
    actionable,
    shutdown,
    morningState,
    journalToday,
    events,
    contexts,
    habits,
  ] = await Promise.all([
      getTasksForDay(user.id, date),
      /*
        `todayIso`, NIE `date`. „Po termíne" znamená „malo to byť hotové
        a nie je" — a to sa meria voči dnešku, nie voči dňu, na ktorý sa
        práve pozerám. S `date` sa pri prekliknutí na zajtrajšok zrazu celý
        dnešok tváril ako prepadnutý, hoci deň ešte ani neskončil.
      */
      getOverdueTasks(user.id, todayIso),
      // „Čo teraz?" siaha ďalej než dnešok — aj na prepadnuté a nenaplánované.
      // Práve to je jeho zmysel: keď sa dnešok minie, stále je čo robiť.
      getActionableTasks(user.id, date),
      getRitualState(user.id, "daily_shutdown", dailyPeriod),
      getRitualState(user.id, "daily_plan", dailyPeriod),
      getJournalEntry(user.id, date),
      // Kalendár je doplnok: keď nie je pripojený alebo Google zlyhá, vráti sa
      // prázdne pole a stránka sa načíta rovnako. Preto smie ísť do rovnakého
      // `Promise.all` ako všetko ostatné — nemá čo zhodiť.
      getDayEvents(user.id, date, user.settings.timezone),
      // Kontexty pre výber „kde si" v „Čo teraz?".
      listContexts(user.id),
      /*
        Návyky sa ťahajú len pre dnešok — na iný deň sa v prehľade nekreslia
        a odškrtávať návyk spätne v prehľade dňa je pomýlené.
      */
      isToday
        ? listHabits(
            user.id,
            startOfWeek(todayIso, user.settings.weekStartsOn),
            todayIso,
            {
              weekStartsOn: user.settings.weekStartsOn,
              todayIso,
              timeZone: user.settings.timezone,
            },
          )
        : Promise.resolve([]),
    ]);

  // Zahodené úlohy do dnešného záväzku nepatria — v zozname by sa tvárili
  // ako nesplnené a kazili by aj počty.
  const dayTasks = planned.filter((task) => task.status !== "dropped");

  /*
    Prepadnuté sa merajú voči dnešku, takže pri prezeraní minulého dňa by sa
    tie isté úlohy objavili dvakrát — raz v dni, raz medzi prepadnutými.
    Sekcia „po termíne" má hovoriť o tom, čo NIE JE na obrazovke.
  */
  const naObrazovke = new Set(planned.map((task) => task.id));
  const overdueOffScreen = overdue.filter((task) => !naObrazovke.has(task.id));
  const openTasks = dayTasks.filter((task) => task.status !== "done");
  const doneCount = dayTasks.length - openTasks.length;

  const frog = dayTasks.find((task) => task.isFrog) ?? null;

  /*
    Rozpočet počíta len to, čo ešte treba spraviť — hotové už čas nezaberie.

    Celodenná úloha nezaberá svoj odhad, ale celé okno dňa. To je celý jej
    zmysel: nehovorí „trvá dlho", ale „tento deň je zabraný", takže po nej
    nesmie v rozpočte ostať voľné miesto na ďalšie plánovanie.
  */
  const oknoDna = Math.max(0, (user.settings.dayEndHour - user.settings.dayStartHour) * 60);
  const jeCelodenny = openTasks.some((task) => task.allDay);
  const plannedMin = openTasks.reduce(
    (sum, task) => sum + (task.allDay ? oknoDna : (task.estimateMin ?? 0)),
    0,
  );
  const withoutEstimate = openTasks.filter((task) => task.estimateMin === null).length;
  const availableMin = oknoDna;
  // Minúty porád idú do rozpočtu surové, hodiny dňa sa o ne neskracujú tu:
  // odpočet si robí `TimeBudget` sám, aby vedel ukázať aj to, koľko z dňa
  // porady zjedli. Celodenné udalosti sa do súčtu nerátajú.
  const meetingMin = meetingMinutes(events);

  const showFrogCard = frog !== null || openTasks.length > 0;

  // Priorita dňa má na obrazovke jedno miesto — kartu nad zoznamom. V zozname
  // sa už neopakuje: dva riadky tej istej úlohy majú každý vlastný optimistický
  // stav, takže po odškrtnutí chvíľu svietia s opačným stavom. Do počtov
  // v hlavičke ani do rozpočtu času to nesiaha — tie stoja na
  // `dayTasks`/`openTasks`. Zo zoznamu ju vyberáme len vtedy, keď je karta
  // naozaj vykreslená, aby nemohla vypadnúť z oboch miest naraz.
  /*
    Lišta sa kreslí VŽDY (od `lg`), lebo rozpočet času aj rituály platia
    každý deň. Bola tu podmienka `events.length > 0 || …area !== null` —
    z čias, keď v lište boli len porady a oblasti a prázdna by zabrala
    svojich 280 px nadarmo. Odkedy do nej pribudol rozpočet a rituály,
    tá podmienka lištu skrývala aj vtedy, keď mala čo ukázať.
  */

  const frogInCard = showFrogCard && frog !== null;
  const listTasks = frogInCard
    ? dayTasks.filter((task) => task.id !== frog.id)
    : dayTasks;

  return (
    /*
      Návrh nemá vonkajšie odsadenie ani `max-w`: stĺpec ide od kraja po kraj
      a sekcie sa oddeľujú vlastnými linkami, nie medzerami. Pravá lišta stojí
      vedľa hlavného stĺpca a siaha cez celú výšku okna.
    */
    <div className="flex w-full items-stretch">
      <div className="flex min-w-0 flex-1 flex-col">
      <DayHeader
        date={date}
        todayIso={todayIso}
        doneCount={doneCount}
        totalCount={dayTasks.length}
        /*
          Rozpočet je v návrhu na telefóne v hlavičke a na počítači v pravej
          lište. Od `lg:` sa tu preto skrýva — kreslí sa raz na každej šírke.
        */
        budget={
          <LiveTimeBudget
            plannedMin={plannedMin}
            allDay={jeCelodenny}
            dateIso={date}
            todayIso={todayIso}
            timeZone={user.settings.timezone}
            dayStartHour={user.settings.dayStartHour}
            dayEndHour={user.settings.dayEndHour}
            withoutEstimate={withoutEstimate}
            meetingMin={meetingMin}
          />
        }
        action={
          /*
            Akcie patria len dnešku. „Čo teraz?" je otázka o TERAZ a rituál je
            záväzok na dnešný deň — pri prezeraní včerajška by oboje ponúkalo
            rozhodnutia o čase, ktorý už prešiel. Rituál by sa navyše otvoril
            sám, čo by pri listovaní dozadu bolo priam nepríjemné.
          */
          isToday ? (
          <>
            <WhatNow
              tasks={actionable}
              todayIso={todayIso}
              contexts={contexts.map((item) => item.name)}
              places={user.settings.places}
            />
            <RitualHost
              period={dailyPeriod}
              dayStartHour={user.settings.dayStartHour}
              morningRitualAt={user.settings.morningRitualAt}
              eveningRitualAt={user.settings.eveningRitualAt}
              morning={{
                completed: morningState.completed,
                ...(morningState.review
                  ? {
                      initialPayload: morningState.review.payload as Record<
                        string,
                        unknown
                      >,
                    }
                  : {}),
                overdue: overdueOffScreen,
                // Priorita dňa sa viaže na `plannedDate`, takže kandidáti musia
                // byť dnešné nevybavené úlohy — inak by sa označila úloha,
                // ktorá na obrazovke „Dnes" nikde nesvieti.
                candidates: openTasks,
                plannedMin,
                availableMin,
                // Rituál dostáva porady tiež — rozpočet aj rozsudok v ňom
                // musia stáť na tom istom dni ako pruh nad zoznamom.
                meetingMin,
                withoutEstimate,
                postponeWarnAt: user.settings.postponeWarnAt,
                postponeBlockAt: user.settings.postponeBlockAt,
              }}
              completed={shutdown.completed}
              {...(shutdown.review
                ? { initialPayload: shutdown.review.payload as Record<string, unknown> }
                : {})}
              {...(journalToday
                ? { initialJournal: { body: journalToday.body, mood: journalToday.mood } }
                : {})}
              tasks={dayTasks}
              todayIso={todayIso}
              timeZone={user.settings.timezone}
              dayEndHour={user.settings.dayEndHour}
              autoOpen={user.settings.ritualAutoOpen}
            />
          </>
          ) : null
        }
      />

      {/*
        Hlavný stĺpec nesie to, čo sa odškrtáva; pravá lišta to, na čo sa pri
        rozhodovaní pozeráš. Pod `lg` sa lišta nekreslí vôbec — podrobnosti
        v `DayRail`.
      */}
      <div className="flex flex-col">
          {/*
            Porady sedia nad prioritou dňa: najprv čím je deň obsadený, až
            potom čo s tým zvyškom. Od `lg` ich prevezme pravá lišta, preto sú
            tu skryté. Je to ten istý komponent dvakrát v strome, ale kreslí
            iba značky a bez stavu — lacnejšie než ho na telefóne stratiť.
          */}
          <div className="lg:hidden">
            <DayMeetings events={events} />
          </div>

          {showFrogCard ? (
            <DayPriorityCard
              frog={frog}
              candidates={openTasks}
              todayIso={todayIso}
              postponeWarnAt={user.settings.postponeWarnAt}
              postponeBlockAt={user.settings.postponeBlockAt}
            />
          ) : null}

          {/*
            Prepadnuté patria LEN k dnešku.

            Merajú sa voči dnešku, takže pri prezeraní zajtrajška by hore
            v stĺpci ostali visieť dnešné a staršie úlohy — človek prepne deň
            a vľavo mu naďalej svieti dnešok. Zajtrajšok je navyše plánovacia
            obrazovka: čo je po termíne, sa tam vybaviť nedá, len to zaberá
            miesto rozhodnutiu o zajtrajšku.
          */}
          {isToday ? (
            <OverdueSection
              tasks={overdueOffScreen}
              todayIso={todayIso}
              postponeWarnAt={user.settings.postponeWarnAt}
              postponeBlockAt={user.settings.postponeBlockAt}
            />
          ) : null}

          <DayList
            tasks={listTasks}
            frogInCard={frogInCard}
            openCount={openTasks.length}
            wipLimit={user.settings.wipLimit}
            todayIso={todayIso}
            postponeWarnAt={user.settings.postponeWarnAt}
            postponeBlockAt={user.settings.postponeBlockAt}
          />
        </div>

        {/* Stavový riadok na spodku stĺpca — v návrhu posledných 34 px. */}
        <DayFooter
          openCount={openTasks.length}
          doneCount={doneCount}
          overdueCount={isToday ? overdueOffScreen.length : 0}
        />
      </div>

      <div className="hidden lg:block">
          <DayRail
            budget={
              <LiveBudgetPanel
                tasks={dayTasks}
                plannedMin={plannedMin}
                allDay={jeCelodenny}
                dateIso={date}
                todayIso={todayIso}
                timeZone={user.settings.timezone}
                meetingMin={meetingMin}
                withoutEstimate={withoutEstimate}
                dayStartHour={user.settings.dayStartHour}
                dayEndHour={user.settings.dayEndHour}
              />
            }
            rituals={
              <DayRituals
                morningDone={morningState.completed}
                shutdownDone={shutdown.completed}
                dayStartHour={user.settings.dayStartHour}
                dayEndHour={user.settings.dayEndHour}
              />
            }
            meetings={events.length > 0 ? <DayMeetings events={events} flush /> : null}
            habits={
              habits.length > 0 ? (
                <DayHabits
                  habits={habits.map((h) => ({
                    id: h.id,
                    name: h.title,
                    targetPerWeek: h.targetPerWeek,
                    weekDone: h.weekDone,
                    doneToday: h.entries.includes(todayIso),
                  }))}
                  todayIso={todayIso}
                />
              ) : null
            }
            areas={<AreasToday tasks={dayTasks} />}
        />
      </div>
    </div>
  );
}

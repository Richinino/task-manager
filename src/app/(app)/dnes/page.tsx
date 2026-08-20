import type { Metadata } from "next";

import { DayHeader } from "@/components/views/dnes/day-header";
import { DayList } from "@/components/views/dnes/day-list";
import { DayMeetings } from "@/components/views/dnes/day-meetings";
import { DayPriorityCard } from "@/components/views/dnes/day-priority-card";
import { OverdueSection } from "@/components/views/dnes/overdue-section";
import { TimeBudget } from "@/components/views/dnes/time-budget";
import { WhatNow } from "@/components/views/dnes/what-now";
import { RitualHost } from "@/components/rituals/ritual-host";
import { addDays, parseIsoDate, todayIn, toIsoDate } from "@/lib/dates";
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
  ] = await Promise.all([
      getTasksForDay(user.id, date),
      getOverdueTasks(user.id, date),
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
    ]);

  // Zahodené úlohy do dnešného záväzku nepatria — v zozname by sa tvárili
  // ako nesplnené a kazili by aj počty.
  const dayTasks = planned.filter((task) => task.status !== "dropped");
  const openTasks = dayTasks.filter((task) => task.status !== "done");
  const doneCount = dayTasks.length - openTasks.length;

  const frog = dayTasks.find((task) => task.isFrog) ?? null;

  // Rozpočet počíta len to, čo ešte treba spraviť — hotové už čas nezaberie.
  const plannedMin = openTasks.reduce((sum, task) => sum + (task.estimateMin ?? 0), 0);
  const withoutEstimate = openTasks.filter((task) => task.estimateMin === null).length;
  const availableMin = Math.max(
    0,
    (user.settings.dayEndHour - user.settings.dayStartHour) * 60,
  );
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
  const frogInCard = showFrogCard && frog !== null;
  const listTasks = frogInCard
    ? dayTasks.filter((task) => task.id !== frog.id)
    : dayTasks;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
      <DayHeader
        date={date}
        todayIso={todayIso}
        doneCount={doneCount}
        totalCount={dayTasks.length}
        budget={
          <TimeBudget
            plannedMin={plannedMin}
            availableMin={availableMin}
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
                overdue,
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

      {/* Porady sedia medzi rozpočtom a prioritou dňa: najprv koľko času
          zostalo, potom čím je obsadený, až potom čo s tým zvyškom. */}
      <DayMeetings events={events} />

      {showFrogCard ? (
        <DayPriorityCard
          frog={frog}
          candidates={openTasks}
          todayIso={todayIso}
          postponeWarnAt={user.settings.postponeWarnAt}
          postponeBlockAt={user.settings.postponeBlockAt}
        />
      ) : null}

      <OverdueSection
        tasks={overdue}
        todayIso={todayIso}
        postponeWarnAt={user.settings.postponeWarnAt}
        postponeBlockAt={user.settings.postponeBlockAt}
      />

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
  );
}

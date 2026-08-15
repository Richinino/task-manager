import type { Metadata } from "next";

import type { DayEntry } from "@/components/views/mesiac/day-cell";
import {
  MONTH_DAY_PANEL_ID,
  MonthDayPanel,
  MonthGrid,
  type MonthDay,
} from "@/components/views/mesiac/month-grid";
import {
  MonthHeader,
  formatMonthTitleSk,
} from "@/components/views/mesiac/month-header";
import { MonthSidebar } from "@/components/views/mesiac/month-sidebar";
import {
  addDays,
  addMonths,
  monthGrid,
  parseIsoDate,
  startOfWeek,
  toIsoDate,
  todayIn,
} from "@/lib/dates";
import { MonthlyReviewLauncher } from "@/components/rituals/review-launcher";
import { ritualPeriod } from "@/lib/rituals";
import { requireUser } from "@/server/auth-guard";
import {
  getCompletedCount,
  getJournalRange,
  getMostPostponed,
  getProjectLastActivity,
  getRitualState,
} from "@/server/queries/rituals";
import { listProjects } from "@/server/queries/structure";
import { getTasksForRange, type TaskWithRelations } from "@/server/queries/tasks";

export const metadata: Metadata = { title: "Mesiac" };

type SearchParamValue = string | string[] | undefined;

interface MesiacPageProps {
  /** Next 16 — `searchParams` je Promise a musí sa awaitovať. */
  searchParams: Promise<Record<string, SearchParamValue>>;
}

/** Z opakovaného parametra berieme prvý — zvyšok je šum z ručne písanej adresy. */
function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Celé číslo v rozsahu, inak `undefined` — nezmysel v URL nesmie zhodiť stránku. */
function parseNumberParam(
  value: SearchParamValue,
  min: number,
  max: number,
): number | undefined {
  const raw = firstValue(value)?.trim();
  if (raw === undefined || !/^\d{1,4}$/.test(raw)) return undefined;

  const parsed = Number(raw);
  return parsed >= min && parsed <= max ? parsed : undefined;
}

/** Úloha je vybavená — v mriežke má stíchnuť a spadnúť pod otvorené. */
function isSettled(task: TaskWithRelations): boolean {
  return task.status === "done" || task.status === "dropped";
}

/**
 * Deň rozbalený pod mriežkou (`?den=`). Prijme sa len dátum, ktorý v zobrazenej
 * mriežke naozaj je — nezmysel v adrese nesmie otvoriť prázdny panel ani zhodiť
 * stránku. Kontrola cez `gridDays` je zároveň validáciou tvaru aj rozsahu.
 */
function parseSelectedDay(
  value: SearchParamValue,
  gridDays: readonly string[],
): string | null {
  const raw = firstValue(value)?.trim();
  if (raw === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return gridDays.includes(raw) ? raw : null;
}

/**
 * Poradie v bunke: najprv termíny (tvrdý záväzok), potom plán, nakoniec
 * vybavené. V rámci skupiny sa drží poradie z dotazu (priorita, sort, vznik),
 * lebo `Array#sort` je stabilný.
 */
function entryRank(entry: DayEntry): number {
  if (entry.done) return 2;
  return entry.kind === "due" ? 0 : 1;
}

/** To isté poradie, ale pre celé úlohy v paneli rozbaleného dňa. */
function dayTaskRank(task: TaskWithRelations, iso: string): number {
  if (isSettled(task)) return 2;
  return task.dueDate === iso ? 0 : 1;
}

export default async function MesiacPage({ searchParams }: MesiacPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const todayIso = todayIn(user.settings.timezone);
  const todayDate = parseIsoDate(todayIso);
  const currentYear = todayDate.getFullYear();
  const currentMonth = todayDate.getMonth() + 1;

  const year = parseNumberParam(params["rok"], 1970, 9999) ?? currentYear;
  const month = parseNumberParam(params["mesiac"], 1, 12) ?? currentMonth;
  const isCurrent = year === currentYear && month === currentMonth;

  const { weekStartsOn } = user.settings;

  // Mriežka nesie aj dobiehajúce dni susedných mesiacov — dotaz ide na celý rozsah.
  const gridDays = monthGrid(year, month, weekStartsOn);
  const from = gridDays[0] ?? todayIso;
  const to = gridDays[gridDays.length - 1] ?? todayIso;

  const firstOfMonth = toIsoDate(new Date(year, month - 1, 1));
  const lastOfMonth = addDays(addMonths(firstOfMonth, 1), -1);

  /**
   * JEDEN dotaz pre celú obrazovku — mriežku aj bočný panel.
   *
   * `includeDue` je tu zapnuté zámerne: mesiac je jediná obrazovka, kde má
   * termín vlastný záznam v bunke dňa, takže musí vidieť aj úlohy, ktoré
   * termín majú a naplánované nie sú (typicky „do 31. 3." z rýchleho
   * zachytenia). Týždenný pohľad si ten istý dotaz pýta bez tohto prepínača,
   * lebo úlohu bez `plannedDate` nemá kam zaradiť.
   */
  const tasks = await getTasksForRange(user.id, from, to, { includeDue: true });

  /* ── Rozsev úloh do dní ──────────────────────────────────────────────────
     Úloha sa v bunke objaví, ak sa na daný deň zhoduje `plannedDate` ALEBO
     `dueDate`. Ak padnú na ten istý deň, kreslí sa raz — a ako termín,
     lebo ten je silnejší záväzok.                                          */
  const entriesByDay = new Map<string, DayEntry[]>();

  function addEntry(iso: string, entry: DayEntry): void {
    if (iso < from || iso > to) return;
    const bucket = entriesByDay.get(iso);
    if (bucket === undefined) entriesByDay.set(iso, [entry]);
    else bucket.push(entry);
  }

  for (const task of tasks) {
    const done = isSettled(task);
    const dueDate = task.dueDate;
    const plannedDate = task.plannedDate;

    if (dueDate !== null) {
      addEntry(dueDate, {
        key: `${task.id}-due`,
        title: task.title,
        kind: "due",
        priority: task.priority,
        done,
        overdue: !done && dueDate < todayIso,
      });
    }

    if (plannedDate !== null && plannedDate !== dueDate) {
      addEntry(plannedDate, {
        key: `${task.id}-planned`,
        title: task.title,
        kind: "planned",
        priority: task.priority,
        done,
        overdue: false,
      });
    }
  }

  for (const bucket of entriesByDay.values()) {
    bucket.sort((a, b) => entryRank(a) - entryRank(b));
  }

  /* ── Rozbalený deň ───────────────────────────────────────────────────────
     Na telefóne sa do bunky nezmestí názov úlohy, takže ťuknutie na deň
     vypíše jeho úlohy do panela POD mriežkou. Stav drží adresa, nie React:
     `?rok=&mesiac=` ostáva, takže sa mesiac pod nohami nemení, deň sa dá
     poslať odkazom a tlačidlo späť ho zavrie.                               */
  const selectedIso = parseSelectedDay(params["den"], gridDays);
  const monthQuery = { rok: year, mesiac: month };
  const closedHref = { pathname: "/mesiac", query: monthQuery };

  const days: MonthDay[] = gridDays.map((iso) => {
    const bucket = entriesByDay.get(iso) ?? [];
    const isSelected = iso === selectedIso;

    return {
      iso,
      inMonth: iso >= firstOfMonth && iso <= lastOfMonth,
      isToday: iso === todayIso,
      isSelected,
      // Bez orezania — `DayCell` potrebuje úplný počet pre signál na telefóne.
      entries: bucket,
      weekHref: { pathname: "/tyzden", query: { od: startOfWeek(iso, weekStartsOn) } },
      // Ťuknutie na už rozbalený deň ho zavrie; kotva pošle stránku na panel.
      dayHref: isSelected
        ? closedHref
        : {
            pathname: "/mesiac",
            query: { ...monthQuery, den: iso },
            hash: MONTH_DAY_PANEL_ID,
          },
    };
  });

  const selectedTasks =
    selectedIso === null
      ? []
      : tasks
          .filter(
            (task) => task.plannedDate === selectedIso || task.dueDate === selectedIso,
          )
          .sort((a, b) => dayTaskRank(a, selectedIso) - dayTaskRank(b, selectedIso));

  /* ── Bočný panel ─────────────────────────────────────────────────────────
     `flatMap` namiesto `filter` preto, aby sa `dueDate` zúžil na `string`
     a triedenie nepotrebovalo výkričník.                                    */
  const dueTasks = tasks
    .flatMap((task) =>
      task.dueDate !== null && task.dueDate >= firstOfMonth && task.dueDate <= lastOfMonth
        ? [{ task, dueDate: task.dueDate }]
        : [],
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((entry) => entry.task);

  const monthHorizonCount = tasks.filter(
    (task) => task.horizon === "month" && !isSettled(task),
  ).length;

  /*
    Mesačná revízia sa vždy viaže na AKTUÁLNY mesiac, nie na prezeraný.
    Listovanie späť do apríla neznamená, že chceš robiť aprílovú revíziu —
    a `periodStart` je kľúč záznamu, takže omyl by založil revíziu do minulosti.
  */
  const monthlyPeriod = ritualPeriod("monthly", todayIso, weekStartsOn);

  const [postponed, completedCount, journalEntries, allProjects, lastActivity, monthlyState] =
    await Promise.all([
      getMostPostponed(
        user.id,
        monthlyPeriod.start,
        monthlyPeriod.end,
        user.settings.timezone,
      ),
      getCompletedCount(
        user.id,
        monthlyPeriod.start,
        monthlyPeriod.end,
        user.settings.timezone,
      ),
      getJournalRange(user.id, monthlyPeriod.start, monthlyPeriod.end),
      listProjects(user.id),
      getProjectLastActivity(user.id, user.settings.timezone),
      getRitualState(user.id, "monthly", monthlyPeriod),
    ]);

  const staleProjects = allProjects
    .filter((project) => project.status === "active" && project.archivedAt === null)
    .map((project) => ({
      project,
      lastActivityDate: lastActivity.get(project.id) ?? null,
    }))
    .filter(
      (row) =>
        row.lastActivityDate === null || row.lastActivityDate < monthlyPeriod.start,
    );

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-3 md:p-5">
      <MonthHeader
        year={year}
        month={month}
        isCurrent={isCurrent}
        action={
          <MonthlyReviewLauncher
            period={monthlyPeriod}
            completed={monthlyState.completed}
            {...(monthlyState.review
              ? { initialPayload: monthlyState.review.payload as Record<string, unknown> }
              : {})}
            todayIso={todayIso}
            mostPostponed={postponed}
            staleProjects={staleProjects}
            journalEntries={journalEntries.map((row) => ({
              date: row.date,
              body: row.body,
              mood: row.mood,
            }))}
            completedCount={completedCount}
            postponeDangerAt={user.settings.postponeBlockAt}
          />
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <MonthGrid days={days} />

          {selectedIso !== null ? (
            <MonthDayPanel
              iso={selectedIso}
              tasks={selectedTasks}
              todayIso={todayIso}
              postponeWarnAt={user.settings.postponeWarnAt}
              postponeBlockAt={user.settings.postponeBlockAt}
              closeHref={closedHref}
              weekHref={{
                pathname: "/tyzden",
                query: { od: startOfWeek(selectedIso, weekStartsOn) },
              }}
            />
          ) : null}
        </div>

        <MonthSidebar
          dueTasks={dueTasks}
          monthHorizonCount={monthHorizonCount}
          monthTitle={formatMonthTitleSk(year, month)}
          todayIso={todayIso}
          postponeWarnAt={user.settings.postponeWarnAt}
          postponeBlockAt={user.settings.postponeBlockAt}
        />
      </div>
    </div>
  );
}

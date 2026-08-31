import "server-only";

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import {
  areas,
  habits,
  learningPillars,
  projects,
  schoolSubjects,
  taggables,
  tags,
  tasks,
  type Area,
  type Habit,
  type LearningPillar,
  type Project,
  type SchoolSubject,
  type Task,
  type TaskStatus,
} from "@/db/schema";

/**
 * Úloha aj so všetkým, čo pre jej vykreslenie potrebuje `TaskItem`.
 * Počty podúloh sa dopĺňajú agregáciou v tom istom dotaze, nie N+1 cyklom.
 */
export interface TaskWithRelations extends Task {
  area: { id: string; name: string; color: string } | null;
  project: { id: string; name: string } | null;
  subtaskCount: number;
  doneSubtaskCount: number;
  /** Štítky úlohy, zoradené podľa názvu. Prázdne pole, keď žiadne nemá. */
  tags: { id: string; name: string; color: string }[];
  /**
   * Pilier, ak je úloha lekcia. `null` znamená obyčajnú úlohu.
   *
   * Farba sa NEPOUŽÍVA na obarvenie riadku — tá patrí oblasti a druhá farba
   * v tom istom riadku by z neho spravila hádanku. Je tu na odznak lekcie
   * a na to, aby sa dala povedať čítačke.
   */
  lessonPillar: { id: string; name: string; color: string } | null;
  /** Návyk, ktorý úloha plní. `null` znamená obyčajnú úlohu. */
  habit: { id: string; title: string } | null;
  /** Školský predmet, ku ktorému úloha patrí. */
  subject: { id: string; code: string; name: string | null; color: string } | null;
}

/** Stavy, po ktorých už úloha nie je „živá". */
const TERMINAL_STATUSES: TaskStatus[] = ["done", "dropped"];

/** Úloha, ktorá ešte čaká na vybavenie. */
/**
 * Deň časovej pečiatky v pásme POUŽÍVATEĽA, nie databázy.
 *
 * Samotné `::date` prevádza podľa pásma spojenia — na Verceli je to UTC.
 * Úloha odškrtnutá v pondelok o 00:30 stredoeurópskeho času by tak spadla
 * do nedele a v týždennom win reporte by chýbala. Je to tá istá pasca ako
 * pri `todayIn`, len o vrstvu nižšie.
 */
export function localDate(column: AnyPgColumn, timeZone: string): SQL {
  return sql`(${column} AT TIME ZONE ${timeZone})::date`;
}

function isOpen(): SQL {
  return notInArray(tasks.status, TERMINAL_STATUSES);
}

/**
 * Poradie zobrazenia: najprv nevybavené, potom priorita (1 hore),
 * potom ručné poradie a nakoniec čas vzniku.
 * `done` aj `dropped` padajú na koniec — obe sú uzavreté stavy.
 */
function taskOrder(): SQL[] {
  return [
    sql`case when ${tasks.status} in ('done', 'dropped') then 1 else 0 end`,
    asc(tasks.priority),
    asc(tasks.sort),
    asc(tasks.createdAt),
  ];
}

/**
 * Jadro všetkých zoznamov. Jeden dotaz: úloha + oblasť + projekt +
 * agregované počty podúloh (LEFT JOIN nad `parentTaskId`).
 */
async function selectTasks(
  userId: string,
  extra: SQL | undefined,
): Promise<TaskWithRelations[]> {
  const db = await getDb();

  // Počty podúloh zoskupené podľa rodiča — jedna agregácia pre celý výsledok.
  const subtaskCounts = db
    .select({
      parentId: tasks.parentTaskId,
      total: sql<number>`cast(count(*) as int)`.as("subtask_total"),
      done: sql<number>`cast(count(*) filter (where ${tasks.status} = 'done') as int)`.as(
        "subtask_done",
      ),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNotNull(tasks.parentTaskId),
      ),
    )
    .groupBy(tasks.parentTaskId)
    .as("subtask_counts");

  /*
    Štítky zlepené do jedného poľa na úlohu. Rovnaký dôvod ako pri podúlohách:
    jedna agregácia pre celý výsledok namiesto dotazu na každý riadok.
  */
  const taskTags = db
    .select({
      taskId: taggables.entityId,
      list: sql<
        { id: string; name: string; color: string }[]
      >`json_agg(json_build_object('id', ${tags.id}, 'name', ${tags.name}, 'color', ${tags.color}) order by ${tags.name})`.as(
        "tag_list",
      ),
    })
    .from(taggables)
    .innerJoin(tags, eq(taggables.tagId, tags.id))
    .where(and(eq(tags.userId, userId), eq(taggables.entityType, "task")))
    .groupBy(taggables.entityId)
    .as("task_tags");

  const rows = await db
    .select({
      task: tasks,
      area: areas,
      project: projects,
      lessonPillar: learningPillars,
      habit: habits,
      subject: schoolSubjects,
      subtaskCount: subtaskCounts.total,
      doneSubtaskCount: subtaskCounts.done,
      tags: taskTags.list,
    })
    .from(tasks)
    /*
      Vlastník sa overuje aj v spojení, nie len v `where`.

      Dnes `tasks.areaId` na cudziu oblasť nikdy neukazuje — stráži to
      `checkRefs()` v akciách. Lenže to je pravidlo držané kódom, nie
      databázou, a stačí jedno miesto, kde sa naň zabudne (import, šablóna,
      budúca funkcia), aby sa v riadku úlohy zobrazil **cudzí názov oblasti**.

      Podmienka patrí do `on`, nie do `where`: pri `where` by sa `leftJoin`
      správal ako `innerJoin` a úloha s cudzou väzbou by zo zoznamu zmizla
      celá. Takto sa len oblasť vykreslí ako prázdna — presne ako pri úlohe
      bez oblasti. Rovnako to už robí `queries/ideas.ts`.
    */
    .leftJoin(areas, and(eq(tasks.areaId, areas.id), eq(areas.userId, userId)))
    .leftJoin(projects, and(eq(tasks.projectId, projects.id), eq(projects.userId, userId)))
    .leftJoin(
      learningPillars,
      and(
        eq(tasks.lessonPillarId, learningPillars.id),
        eq(learningPillars.userId, userId),
      ),
    )
    .leftJoin(habits, and(eq(tasks.habitId, habits.id), eq(habits.userId, userId)))
    .leftJoin(
      schoolSubjects,
      and(eq(tasks.subjectId, schoolSubjects.id), eq(schoolSubjects.userId, userId)),
    )
    .leftJoin(subtaskCounts, eq(subtaskCounts.parentId, tasks.id))
    .leftJoin(taskTags, eq(taskTags.taskId, tasks.id))
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), extra))
    .orderBy(...taskOrder());

  return rows.map((row) => toTaskWithRelations(row));
}

function toTaskWithRelations(row: {
  task: Task;
  area: Area | null;
  project: Project | null;
  lessonPillar?: LearningPillar | null;
  habit?: Habit | null;
  subject?: SchoolSubject | null;
  subtaskCount: number | null;
  doneSubtaskCount: number | null;
  tags?: { id: string; name: string; color: string }[] | null;
}): TaskWithRelations {
  return {
    ...row.task,
    area: row.area
      ? { id: row.area.id, name: row.area.name, color: row.area.color }
      : null,
    project: row.project ? { id: row.project.id, name: row.project.name } : null,
    lessonPillar: row.lessonPillar
      ? {
          id: row.lessonPillar.id,
          name: row.lessonPillar.name,
          color: row.lessonPillar.color,
        }
      : null,
    habit: row.habit ? { id: row.habit.id, title: row.habit.title } : null,
    subject: row.subject
      ? {
          id: row.subject.id,
          code: row.subject.code,
          name: row.subject.name,
          color: row.subject.color,
        }
      : null,
    subtaskCount: Number(row.subtaskCount ?? 0),
    doneSubtaskCount: Number(row.doneSubtaskCount ?? 0),
    // `json_agg` bez zhody nevráti prázdne pole, ale NULL — preto tá poistka.
    tags: row.tags ?? [],
  };
}

/** Všetko, čo je naplánované na daný deň — vrátane už hotových (padnú na koniec). */
export function getTasksForDay(
  userId: string,
  date: string,
): Promise<TaskWithRelations[]> {
  return selectTasks(userId, eq(tasks.plannedDate, date));
}

export interface TasksForRangeOptions {
  /**
   * Pribrať aj úlohy, ktoré do rozsahu spadajú iba termínom (`dueDate`),
   * hoci naplánované nie sú vôbec.
   *
   * Štandardne vypnuté: týždenný pohľad radí úlohy do stĺpcov podľa
   * `plannedDate`, takže úloha bez plánu by v ňom nemala kam patriť.
   * Zapína to mesačný pohľad, kde je termín samostatný záznam v bunke dňa.
   */
  includeDue?: boolean;
}

/**
 * Naplánované v intervale vrátane oboch krajných dní.
 * S `includeDue` aj to, čo v intervale končí termínom.
 */
export function getTasksForRange(
  userId: string,
  from: string,
  to: string,
  options: TasksForRangeOptions = {},
): Promise<TaskWithRelations[]> {
  const planned = and(gte(tasks.plannedDate, from), lte(tasks.plannedDate, to));
  if (options.includeDue !== true) return selectTasks(userId, planned);

  const due = and(gte(tasks.dueDate, from), lte(tasks.dueDate, to));
  return selectTasks(userId, or(planned, due));
}

/**
 * Úlohy podľa identifikátorov, v poradí, v akom prišli.
 *
 * Existuje kvôli mesačnej revízii, ktorá si poradie skladá sama (podľa počtu
 * odkladov v období) a potrebuje k nemu dotiahnuť celé úlohy. Mäkko zmazané
 * vypadnú, takže výsledok môže byť kratší než vstup — volajúci s tým počíta.
 */
export async function getTasksByIds(
  userId: string,
  ids: string[],
): Promise<TaskWithRelations[]> {
  if (ids.length === 0) return [];
  const found = await selectTasks(userId, inArray(tasks.id, ids));
  const byId = new Map(found.map((task) => [task.id, task]));
  return ids
    .map((id) => byId.get(id))
    .filter((task): task is TaskWithRelations => task !== undefined);
}

/**
 * Všetko dokončené v období — podklad pre týždenný win report.
 *
 * Radí sa od najnovšieho: pri zatváraní týždňa človek najskôr vidí to, čo má
 * v čerstvej pamäti, a spomienka na zvyšok sa naň nabalí.
 */
export function getCompletedInPeriod(
  userId: string,
  from: string,
  to: string,
  timeZone: string,
): Promise<TaskWithRelations[]> {
  return selectTasks(
    userId,
    and(
      eq(tasks.status, "done"),
      isNotNull(tasks.completedAt),
      gte(localDate(tasks.completedAt, timeZone), from),
      lte(localDate(tasks.completedAt, timeZone), to),
    ),
  );
}

export interface ContextUsage {
  /** Bez zavináča — ten si dopĺňa rozhranie samo. */
  name: string;
  taskCount: number;
}

/**
 * Kontexty, ktoré používateľ naozaj používa, od najčastejšieho.
 *
 * Zoznam kontextov nikde neexistuje — `@pocitac` vzniká tým, že si ho človek
 * napíše. Preto sa odvodzuje z úloh: to, čo je použité, je to, čo existuje.
 *
 * Zavináč sa odsekáva. Parser ho do `tasks.context` ukladá **aj s ním**
 * (na rozdiel od štítkov a projektov), ale staršie záznamy ani ručne vyplnené
 * pole v detaile ho mať nemusia — normalizuje sa preto tu, na jednom mieste.
 */
export async function listContexts(userId: string): Promise<ContextUsage[]> {
  const db = await getDb();

  const rows = await db
    .select({
      name: sql<string>`btrim(ltrim(btrim(${tasks.context}), '@'))`,
      taskCount: sql<number>`cast(count(*) as int)`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNotNull(tasks.context),
        sql`btrim(ltrim(btrim(${tasks.context}), '@')) <> ''`,
      ),
    )
    .groupBy(sql`btrim(ltrim(btrim(${tasks.context}), '@'))`)
    .orderBy(sql`count(*) desc`);

  return rows.map((row) => ({ name: row.name, taskCount: Number(row.taskCount) }));
}

/** Nespracované zachytenia. */
export function getInboxTasks(userId: string): Promise<TaskWithRelations[]> {
  return selectTasks(userId, eq(tasks.status, "inbox"));
}

/**
 * Prepadnuté úlohy k danému dňu.
 *
 * Zámerne sem nepatria úlohy naplánované na `asOf` alebo neskôr, aj keby mali
 * prešvihnutý termín — tie sa už zobrazujú vo svojom dni a duplicita by mýlila.
 */
export function getOverdueTasks(
  userId: string,
  asOf: string,
): Promise<TaskWithRelations[]> {
  return selectTasks(
    userId,
    and(
      isOpen(),
      /*
        Úloha viazaná na svoj deň sa medzi prepadnuté nikdy nedostane.
        Tréning je buď v utorok, alebo nebol — v „po termíne" patria veci,
        ktoré sa ešte dajú dobehnúť, a toto medzi ne nepatrí.
      */
      eq(tasks.staysOnDay, false),
      or(
        lt(tasks.plannedDate, asOf),
        and(isNull(tasks.plannedDate), lt(tasks.dueDate, asOf)),
      ),
    ),
  );
}

/**
 * Kandidáti pre „Čo teraz?".
 *
 * Všetko otvorené, čo sa dá robiť dnes: naplánované na dnes alebo skôr, alebo
 * bez plánu s termínom, ktorý už beží. Úlohy naplánované na neskôr sem
 * NEPATRIA — človek si ich vedome odložil a „Čo teraz?" nie je nástroj na to,
 * aby mu ich vrátilo pod ruku.
 *
 * `waiting` vypadáva tiež: čakanie na niekoho iného nie je práca, ktorú ide
 * spraviť teraz. Podúlohy áno — často sú to práve tie najmenšie kroky.
 */
export function getActionableTasks(
  userId: string,
  todayIso: string,
): Promise<TaskWithRelations[]> {
  return selectTasks(
    userId,
    and(
      isOpen(),
      ne(tasks.status, "waiting"),
      or(
        lte(tasks.plannedDate, todayIso),
        and(isNull(tasks.plannedDate), lte(tasks.dueDate, todayIso)),
        and(isNull(tasks.plannedDate), isNull(tasks.dueDate)),
      ),
    ),
  );
}

/**
 * Odložené „niekedy" — zásobáreň, z ktorej sa ťahá pri plánovaní.
 *
 * Zámerne sem patria aj tie, ktoré ešte visia v stave `inbox` — triedenie
 * v inboxe pri voľbe „Niekedy" stav nemení práve preto, že úloha bez dátumu
 * a mimo inboxu by nebola na žiadnej obrazovke. Odkedy má „Niekedy" vlastný
 * zoznam, sú viditeľné na oboch miestach, čo je správne: v inboxe ako
 * nedotriedené, tu ako odložené.
 */
export function getSomedayTasks(userId: string): Promise<TaskWithRelations[]> {
  return selectTasks(userId, and(eq(tasks.horizon, "someday"), isOpen()));
}

/**
 * Úlohy s pravidlom opakovania — podklad obrazovky `/opakovane`.
 *
 * Zámerne BEZ `isOpen()`: opakovaná úloha je v stave `done` úplne bežne,
 * lebo práve odškrtnutie zrodí ďalší výskyt. Filtrovať otvorené by znamenalo,
 * že pravidlo z prehľadu zmizne v okamihu, keď si ho splnil — teda presne
 * vtedy, keď je namieste pozrieť sa, kedy príde nabudúce.
 *
 * Nezobrazujú sa deti opakovania (`recurrenceParentId`), len samotné
 * pravidlá; inak by tu po roku ležalo päťdesiat kópií tej istej veci.
 */
export function getRecurringTasks(userId: string): Promise<TaskWithRelations[]> {
  return selectTasks(
    userId,
    and(isNotNull(tasks.recurrenceRule), isNull(tasks.recurrenceParentId)),
  );
}

/**
 * Úlohy, ktoré blokuje niekto iný. Stav `waiting` doteraz v aplikácii
 * nemal žiadne miesto, hoci v schéme je od začiatku.
 */
export function getWaitingTasks(userId: string): Promise<TaskWithRelations[]> {
  return selectTasks(userId, eq(tasks.status, "waiting"));
}

/**
 * Úlohy jedného projektu.
 *
 * Podúlohy sa zámerne vynechávajú: podúloha dedí projekt po rodičovi, takže
 * bez tohto filtra by v zozname stála druhýkrát — raz ako samostatný riadok
 * a raz v počítadle svojho rodiča.
 */
export function getProjectTasks(
  userId: string,
  projectId: string,
): Promise<TaskWithRelations[]> {
  return selectTasks(
    userId,
    and(eq(tasks.projectId, projectId), isNull(tasks.parentTaskId)),
  );
}

export async function getTask(
  userId: string,
  id: string,
): Promise<TaskWithRelations | null> {
  const rows = await selectTasks(userId, eq(tasks.id, id));
  return rows[0] ?? null;
}

/**
 * Čísla do bočného panela. Jeden dotaz s podmienenými agregáciami.
 * `today` a `overdue` počítajú len nevybavené — badge má ukazovať, čo ešte čaká.
 */
export async function getCounts(
  userId: string,
  today: string,
): Promise<{
  inbox: number;
  today: number;
  overdue: number;
  someday: number;
  waiting: number;
}> {
  const db = await getDb();

  const rows = await db
    .select({
      inbox: sql<number>`cast(count(*) filter (where ${tasks.status} = 'inbox') as int)`,
      someday: sql<number>`cast(count(*) filter (
        where ${tasks.horizon} = 'someday'
          and ${tasks.status} not in ('done', 'dropped')
      ) as int)`,
      waiting: sql<number>`cast(count(*) filter (where ${tasks.status} = 'waiting') as int)`,
      today: sql<number>`cast(count(*) filter (
        where ${tasks.plannedDate} = ${today}
          and ${tasks.status} not in ('done', 'dropped')
      ) as int)`,
      overdue: sql<number>`cast(count(*) filter (
        where ${tasks.status} not in ('done', 'dropped')
          and (
            ${tasks.plannedDate} < ${today}
            or (${tasks.plannedDate} is null and ${tasks.dueDate} < ${today})
          )
      ) as int)`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));

  const row = rows[0];
  return {
    inbox: Number(row?.inbox ?? 0),
    today: Number(row?.today ?? 0),
    overdue: Number(row?.overdue ?? 0),
    someday: Number(row?.someday ?? 0),
    waiting: Number(row?.waiting ?? 0),
  };
}

/** Aktívne oblasti pre výber a farebné bodky. Archivované sa neponúkajú. */
export async function getAreas(userId: string): Promise<Area[]> {
  const db = await getDb();
  return db
    .select()
    .from(areas)
    .where(
      and(
        eq(areas.userId, userId),
        isNull(areas.deletedAt),
        isNull(areas.archivedAt),
      ),
    )
    .orderBy(asc(areas.sort), asc(areas.name));
}

/** Aktívne projekty pre výber a priradenie z rýchleho zachytenia. */
export async function getProjects(userId: string): Promise<Project[]> {
  const db = await getDb();
  return db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projects.sort), asc(projects.name));
}

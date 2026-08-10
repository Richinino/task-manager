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

import { getDb } from "@/db";
import {
  areas,
  projects,
  taggables,
  tags,
  tasks,
  type Area,
  type Project,
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
}

/** Stavy, po ktorých už úloha nie je „živá". */
const TERMINAL_STATUSES: TaskStatus[] = ["done", "dropped"];

/** Úloha, ktorá ešte čaká na vybavenie. */
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
      subtaskCount: subtaskCounts.total,
      doneSubtaskCount: subtaskCounts.done,
      tags: taskTags.list,
    })
    .from(tasks)
    .leftJoin(areas, eq(tasks.areaId, areas.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
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

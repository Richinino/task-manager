import "server-only";

import { and, asc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

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
} from "@/db/schema";

/**
 * Čítacia vrstva štruktúry: projekty, oblasti, podúlohy, štítky.
 *
 * Zámerne sa tu nič nevolá `getAreas`/`getProjects` — tie už existujú
 * v `queries/tasks.ts` a slúžia na plnenie výberov. Tu ide o zoznamy
 * s číslami pre samostatné obrazovky, preto `listAreas`/`listProjects`.
 *
 * Každý dotaz filtruje `userId` aj `deletedAt IS NULL`. Výnimkou je `tags`,
 * ktorá stĺpec `deleted_at` nemá vôbec — štítok bez použitia sa nemaže mäkko,
 * ostáva ako prázdny riadok v číselníku.
 */

/** Štítok. Schéma preň nevyexportovala typ, dopĺňame ho tu. */
export type Tag = typeof tags.$inferSelect;

export interface ProjectWithCounts extends Project {
  area: { id: string; name: string; color: string } | null;
  openTaskCount: number;
  doneTaskCount: number;
  /** Najbližší termín spomedzi nevybavených úloh projektu. */
  nextDueDate: string | null;
}

export interface AreaWithCounts extends Area {
  openTaskCount: number;
  projectCount: number;
}

export interface ListOptions {
  /** Pribrať aj archivované. Predvolene nie — archív do výberov nepatrí. */
  includeArchived?: boolean;
}

/**
 * Uzavreté stavy úlohy. Ako reťazcový zoznam preto, že sa vkladá do agregácií
 * s `filter`, kde by parametrizované pole robilo zbytočne zložitý SQL.
 */
const CLOSED_TASK_STATUSES = sql`('done', 'dropped')`;

/* ═══════════════════════════════════════════════════════════════════════════
   PROJEKTY
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Jeden dotaz pre celý zoznam: projekt + oblasť + agregované počty úloh
 * + najbližší termín. Počty sa rátajú v predpočítanom podotaze zoskupenom
 * podľa `project_id`, nie cyklom nad projektmi.
 *
 * `min(due_date)` sa pretypuje na text zámerne — dátumy sú v celej aplikácii
 * reťazce `YYYY-MM-DD` a ovládač by inak z holého `date` spravil `Date`
 * v pásme servera, čo je presne ten posun o deň, ktorý riešime všade inde.
 */
async function selectProjects(
  userId: string,
  extra: SQL | undefined,
  options: ListOptions,
): Promise<ProjectWithCounts[]> {
  const db = await getDb();

  const stats = db
    .select({
      projectId: tasks.projectId,
      openCount:
        sql<number>`cast(count(*) filter (where ${tasks.status} not in ${CLOSED_TASK_STATUSES}) as int)`.as(
          "open_count",
        ),
      doneCount:
        sql<number>`cast(count(*) filter (where ${tasks.status} = 'done') as int)`.as(
          "done_count",
        ),
      nextDueDate:
        sql<string | null>`cast(min(${tasks.dueDate}) filter (where ${tasks.status} not in ${CLOSED_TASK_STATUSES}) as text)`.as(
          "next_due_date",
        ),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNotNull(tasks.projectId),
      ),
    )
    .groupBy(tasks.projectId)
    .as("project_task_stats");

  const rows = await db
    .select({
      project: projects,
      area: areas,
      openTaskCount: stats.openCount,
      doneTaskCount: stats.doneCount,
      nextDueDate: stats.nextDueDate,
    })
    .from(projects)
    .leftJoin(areas, eq(projects.areaId, areas.id))
    .leftJoin(stats, eq(stats.projectId, projects.id))
    .where(
      and(
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
        options.includeArchived === true ? undefined : isNull(projects.archivedAt),
        extra,
      ),
    )
    .orderBy(
      // Uzavreté projekty padajú na koniec, rovnako ako uzavreté úlohy.
      sql`case when ${projects.status} in ('done', 'dropped') then 1 else 0 end`,
      asc(projects.sort),
      asc(projects.name),
    );

  return rows.map((row) => ({
    ...row.project,
    area: row.area
      ? { id: row.area.id, name: row.area.name, color: row.area.color }
      : null,
    openTaskCount: Number(row.openTaskCount ?? 0),
    doneTaskCount: Number(row.doneTaskCount ?? 0),
    nextDueDate: row.nextDueDate ?? null,
  }));
}

export function listProjects(
  userId: string,
  options: ListOptions = {},
): Promise<ProjectWithCounts[]> {
  return selectProjects(userId, undefined, options);
}

/**
 * Detail projektu. Archivovaný sa načíta tiež — na jeho obrazovku vedie odkaz
 * z archívu a nesmie skončiť ako „nenašlo sa".
 */
export async function getProject(
  userId: string,
  id: string,
): Promise<ProjectWithCounts | null> {
  const rows = await selectProjects(userId, eq(projects.id, id), {
    includeArchived: true,
  });
  return rows[0] ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OBLASTI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Počty pre oblasť sa rátajú z priameho priradenia (`tasks.area_id`,
 * `projects.area_id`), nie tranzitívne cez projekt. Úloha, ktorá má projekt
 * v oblasti, ale vlastnú oblasť nevyplnenú, sa teda do počtu oblasti neráta —
 * inak by tá istá úloha bola raz započítaná priamo a raz cez projekt a čísla
 * by si protirečili.
 */
async function selectAreas(
  userId: string,
  extra: SQL | undefined,
  options: ListOptions,
): Promise<AreaWithCounts[]> {
  const db = await getDb();

  const taskStats = db
    .select({
      areaId: tasks.areaId,
      openCount:
        sql<number>`cast(count(*) filter (where ${tasks.status} not in ${CLOSED_TASK_STATUSES}) as int)`.as(
          "area_open_count",
        ),
    })
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), isNull(tasks.deletedAt), isNotNull(tasks.areaId)),
    )
    .groupBy(tasks.areaId)
    .as("area_task_stats");

  const projectStats = db
    .select({
      areaId: projects.areaId,
      projectCount: sql<number>`cast(count(*) as int)`.as("area_project_count"),
    })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
        isNull(projects.archivedAt),
        isNotNull(projects.areaId),
      ),
    )
    .groupBy(projects.areaId)
    .as("area_project_stats");

  const rows = await db
    .select({
      area: areas,
      openTaskCount: taskStats.openCount,
      projectCount: projectStats.projectCount,
    })
    .from(areas)
    .leftJoin(taskStats, eq(taskStats.areaId, areas.id))
    .leftJoin(projectStats, eq(projectStats.areaId, areas.id))
    .where(
      and(
        eq(areas.userId, userId),
        isNull(areas.deletedAt),
        options.includeArchived === true ? undefined : isNull(areas.archivedAt),
        extra,
      ),
    )
    .orderBy(asc(areas.sort), asc(areas.name));

  return rows.map((row) => ({
    ...row.area,
    openTaskCount: Number(row.openTaskCount ?? 0),
    projectCount: Number(row.projectCount ?? 0),
  }));
}

export function listAreas(
  userId: string,
  options: ListOptions = {},
): Promise<AreaWithCounts[]> {
  return selectAreas(userId, undefined, options);
}

export async function getArea(
  userId: string,
  id: string,
): Promise<AreaWithCounts | null> {
  const rows = await selectAreas(userId, eq(areas.id, id), {
    includeArchived: true,
  });
  return rows[0] ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PODÚLOHY
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Podúlohy jednej úlohy, zoradené podľa `sort`.
 *
 * Vracajú sa aj hotové — kontrolný zoznam má ukázať odškrtnuté položky,
 * nie ich schovať. Vlastníctvo rodiča sa neoveruje zvlášť: filter `userId`
 * zabezpečí, že cudzie podúlohy sa nikdy nevrátia.
 */
export async function getSubtasks(
  userId: string,
  parentTaskId: string,
): Promise<Task[]> {
  const db = await getDb();
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        eq(tasks.parentTaskId, parentTaskId),
      ),
    )
    .orderBy(asc(tasks.sort), asc(tasks.createdAt));
}

/* ═══════════════════════════════════════════════════════════════════════════
   ŠTÍTKY
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Štítky priradené jednej úlohe.
 *
 * `taggables` je polymorfná — bez `entityType = 'task'` by sa do výsledku
 * dostali väzby nápadov aj projektov s rovnakým identifikátorom. Spojenie
 * na `tasks` je tu preto, aby aj tento dotaz filtroval `deletedAt IS NULL`.
 */
export async function getTaskTags(userId: string, taskId: string): Promise<Tag[]> {
  const db = await getDb();
  const rows = await db
    .select({ tag: tags })
    .from(taggables)
    .innerJoin(tags, eq(tags.id, taggables.tagId))
    .innerJoin(tasks, eq(tasks.id, taggables.entityId))
    .where(
      and(
        eq(taggables.entityType, "task"),
        eq(taggables.entityId, taskId),
        eq(tags.userId, userId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tags.name));

  return rows.map((row) => row.tag);
}

/**
 * Všetky štítky používateľa aj s počtom použití.
 *
 * Počíta sa jednou agregáciou nad `taggables` spojenou so živými úlohami —
 * mäkko zmazaná úloha svoju väzbu v `taggables` nechá, ale do počtu sa
 * rátať nesmie, inak by číslo pri štítku sľubovalo úlohy, ktoré nikde nie sú.
 */
export async function listTags(
  userId: string,
): Promise<(Tag & { taskCount: number })[]> {
  const db = await getDb();

  const usage = db
    .select({
      tagId: taggables.tagId,
      taskCount: sql<number>`cast(count(*) as int)`.as("tag_task_count"),
    })
    .from(taggables)
    .innerJoin(tasks, eq(tasks.id, taggables.entityId))
    .where(
      and(
        eq(taggables.entityType, "task"),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    )
    .groupBy(taggables.tagId)
    .as("tag_usage");

  const rows = await db
    .select({ tag: tags, taskCount: usage.taskCount })
    .from(tags)
    .leftJoin(usage, eq(usage.tagId, tags.id))
    .where(eq(tags.userId, userId))
    .orderBy(asc(tags.name));

  return rows.map((row) => ({ ...row.tag, taskCount: Number(row.taskCount ?? 0) }));
}

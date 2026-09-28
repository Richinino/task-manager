import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { addDays, todayIn } from "@/lib/dates";
import { ritualPeriod } from "@/lib/rituals";
import { lessonSlotFor } from "@/server/agenda-write";
import { requireUser } from "@/server/auth-guard";
import {
  createAgendaItem,
  moveAgendaItem,
  setAgendaCancelled,
  setAgendaGrade,
  updateAgendaItem,
} from "@/server/actions/agenda";
import { shiftPrep } from "@/server/actions/agenda-prep";
import { completeRitual } from "@/server/actions/rituals";
import { attachTag, detachTag } from "@/server/actions/structure";
import {
  dropTask,
  materializeDueRecurrences,
  moveToSomeday,
  quickCapture,
  rescheduleTask,
  restoreTask,
  setFrog,
  toggleTaskDone,
  updateTask,
} from "@/server/actions/tasks";
import { getAgendaForRange, getAgendaItem } from "@/server/queries/agenda";
import { getRitualState } from "@/server/queries/rituals";
import { listSubjects } from "@/server/queries/school";
import { search } from "@/server/queries/search";
import { listTags } from "@/server/queries/structure";
import {
  getAreas,
  getInboxTasks,
  getOpenOccurrences,
  getProjects,
  getTask,
  getTasksByIds,
  getTasksForRange,
  listContexts,
} from "@/server/queries/tasks";

import { dayOverview } from "./day";
import {
  agendaCreateInput,
  agendaForm,
  changedFields,
  lessonSlotWanted,
  planAgendaEdit,
  resolveNamed,
  tagChanges,
  taskPatch,
  type NamedKind,
  type TaskRefs,
} from "./edit";
import { errorResult, jsonResult, mcpAgenda, mcpTask } from "./format";

/*
  MCP server Task manažéra (docs/MCP.md).

  Nástroje čítajú cez tie isté dotazy ako obrazovky a menia cez tie isté
  serverové akcie ako tlačidlá — `requireUser()` v nich nájde používateľa
  overeného tokenom (`runAsUser` v `/api/mcp`). Platia teda tie isté pravidlá:
  strážca odkladov, jedna priorita dňa, história úlohy, dobiehanie opakovaných.

  Popisy nástrojov sú po anglicky — čítajú ich modely a tie sa v nich
  orientujú najistejšie. Dáta sú po slovensky, tak ako ich človek zapísal.
*/

const SERVER_INSTRUCTIONS = `Task manažér is the user's personal task manager (Slovak UI and data; answer the user in Slovak unless they write in another language).

Always start with get_day to see the day. Dates are YYYY-MM-DD in the user's time zone; "today" is the \`today\` field of get_day, never your own clock.

Morning routine (ranný rituál), in this order:
1. start_morning_ritual — catches up recurring tasks and returns the day.
2. Overdue tasks: for each, the user decides — plan_task to today, plan_task to a later date, or drop_task. Suggest, but ask before changing unless the user told you to decide for them.
3. Priority of the day: one task via set_priority_of_day — the one thing that makes the day a success.
4. Time budget: compare plannedMin with availableMin minus school and meetings (timeBudget.freeMin). If negative, suggest moving tasks to other days.
5. finish_morning_ritual — marks the ritual done in the app.

Editing: update_task changes a task's fields (title, note, due date, time, estimate, priority, energy, context, project, area, subject, tags); moving it to another day is always plan_task. reopen_task undoes complete_task and drop_task. Events, exams and deadlines: create_event and update_event (date, time, place, cancel, grade). get_structure lists valid project, area and subject names. Before bigger changes — moving events, editing several tasks at once, clearing notes — say what you will change and ask, unless the user told you to decide.

Use only task and event IDs returned by the tools. Nothing is ever hard-deleted: drop_task marks a task as dropped (recoverable in the app's archive or with reopen_task), and a cancelled event stays in the list crossed out.`;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).");
const idSchema = z.string().min(1).max(64);
/** Meno projektu, oblasti či predmetu — tak, ako ho model videl vo výstupe. */
const nameSchema = z.string().max(200);
const kindSchema = z
  .enum(["event", "deadline"])
  .describe("event = it happens and the user is there (exam, doctor, trip); deadline = something must be done by then (hand-in, payment).");
const typeSchema = z
  .enum(["exam", "oral", "submit", "other"])
  .describe("exam = written exam (písomka) and oral = oral exam (skúšanie), both events; submit = hand-in (odovzdanie), a deadline; other = anything else.");

/** Zhrnutie výsledku akcie s aktuálnym stavom úlohy — model vidí, čo sa naozaj stalo. */
async function taskAfter(userId: string, id: string) {
  const task = await getTask(userId, id);
  return task === null ? null : mcpTask(task);
}

/**
 * Meno projektu, oblasti alebo predmetu → id, pre prihláseného človeka.
 * Ponúkajú sa tie isté ako vo výbere v appke: aktívne projekty a oblasti,
 * všetky predmety.
 */
async function resolveRef(userId: string, kind: NamedKind, input: string | null) {
  if (input === null) return resolveNamed(kind, null, []);
  if (kind === "project") {
    const projects = await getProjects(userId);
    return resolveNamed(kind, input, projects.map((p) => ({ id: p.id, name: p.name })));
  }
  if (kind === "area") {
    const areas = await getAreas(userId);
    return resolveNamed(kind, input, areas.map((a) => ({ id: a.id, name: a.name })));
  }
  const subjects = await listSubjects(userId);
  return resolveNamed(kind, input, subjects.map((s) => ({ id: s.id, name: s.code, alt: s.name })));
}

/**
 * Chyba úpravy, ktorá sa robí v krokoch. Keď niečo už prešlo, model to
 * musí vedieť — inak by povedal „nepodarilo sa", hoci polovica je zapísaná.
 */
function failedAfter(done: readonly string[], error: string) {
  return errorResult(done.length === 0 ? error : `${error} Already saved before this failed: ${done.join("; ")}.`);
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "task-manazer", title: "Task manažér", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  /* ── čítanie ─────────────────────────────────────────────────────────── */

  server.registerTool(
    "get_day",
    {
      title: "Prehľad dňa",
      description:
        "Overview of one day (default today): open tasks planned for it, overdue tasks, priority of the day, time budget, school timetable, calendar meetings, events and exams (that day and the next 14 days), habits, inbox count and whether the morning ritual is done.",
      inputSchema: { date: dateSchema.optional().describe("Day to show, YYYY-MM-DD. Default: today.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date }) => {
      const user = await requireUser();
      return jsonResult(await dayOverview(user, date));
    },
  );

  server.registerTool(
    "get_inbox",
    {
      title: "Inbox",
      description: "Captured tasks that are not sorted yet (no day, no project). Includes notes.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const user = await requireUser();
      const inbox = await getInboxTasks(user.id);
      return jsonResult({ count: inbox.length, tasks: inbox.map((task) => mcpTask(task, true)) });
    },
  );

  server.registerTool(
    "get_upcoming",
    {
      title: "Najbližšie dni",
      description:
        "Tasks planned or due in the next days, grouped by day, plus events and deadlines (exams, trips, hand-ins) in the same range. Good for weekly planning or moving tasks to a lighter day.",
      inputSchema: {
        days: z.number().int().min(1).max(31).optional().describe("How many days ahead, including today. Default 7."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ days }) => {
      const user = await requireUser();
      const todayIso = todayIn(user.settings.timezone);
      const to = addDays(todayIso, (days ?? 7) - 1);
      const [tasks, agenda] = await Promise.all([
        getTasksForRange(user.id, todayIso, to, { includeDue: true }),
        getAgendaForRange(user.id, todayIso, to),
      ]);
      const open = tasks.filter((task) => task.status !== "done" && task.status !== "dropped");
      const byDay: Record<string, ReturnType<typeof mcpTask>[]> = {};
      const dueOnly: ReturnType<typeof mcpTask>[] = [];
      for (const task of open) {
        if (task.plannedDate !== null && task.plannedDate >= todayIso && task.plannedDate <= to) {
          (byDay[task.plannedDate] ??= []).push(mcpTask(task));
        } else {
          dueOnly.push(mcpTask(task));
        }
      }
      return jsonResult({
        from: todayIso,
        to,
        plannedByDay: byDay,
        dueInRangeNotPlanned: dueOnly,
        events: agenda.map((item) => mcpAgenda(item, todayIso)),
      });
    },
  );

  server.registerTool(
    "search",
    {
      title: "Hľadať",
      description:
        "Full-text search across tasks, events, ideas, projects, areas and the journal, including done, dropped and past items. Accent-insensitive. Task hits carry their status (done, dropped, deleted…); ids work with update_task, reopen_task and update_event.",
      inputSchema: { query: z.string().min(2).max(200) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const user = await requireUser();
      const hits = await search(user.id, query, { todayIso: todayIn(user.settings.timezone), limit: 25 });
      /* Stav úlohy — z „v archíve" sa nedá poznať, či je hotová, zahodená, alebo zmazaná. */
      const taskIds = hits.filter((hit) => hit.kind === "task").map((hit) => hit.id);
      const live = new Map((await getTasksByIds(user.id, taskIds)).map((task) => [task.id, task.status]));
      return jsonResult(
        hits.map(({ kind, id, title, snippet, meta, archived, archivedLabel }) => ({
          kind,
          id,
          title,
          snippet,
          meta,
          ...(kind === "task" ? { status: live.get(id) ?? "deleted" } : {}),
          archived: archived ? (archivedLabel ?? "v archíve") : false,
        })),
      );
    },
  );

  server.registerTool(
    "get_structure",
    {
      title: "Projekty, oblasti, predmety",
      description:
        "The user's active projects, areas, school subjects, tags and task contexts — the valid names for project, area and subject in update_task, create_event and update_event.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const user = await requireUser();
      const [projects, areas, subjects, tags, contexts] = await Promise.all([
        getProjects(user.id),
        getAreas(user.id),
        listSubjects(user.id),
        listTags(user.id),
        listContexts(user.id),
      ]);
      const areaName = new Map(areas.map((area) => [area.id, area.name]));
      return jsonResult({
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          area: p.areaId !== null ? (areaName.get(p.areaId) ?? null) : null,
          status: p.status,
        })),
        areas: areas.map((a) => ({ id: a.id, name: a.name })),
        subjects: subjects.map((s) => ({ id: s.id, code: s.code, name: s.name })),
        tags: tags.map((t) => t.name),
        contexts: contexts.map((c) => c.name),
      });
    },
  );

  /* ── zmeny ───────────────────────────────────────────────────────────── */

  server.registerTool(
    "capture",
    {
      title: "Zachytiť úlohu",
      description:
        "Create a task (or an exam event) from one line of Slovak quick-capture syntax, exactly like typing into the app. Syntax: 'v piatok' / 'zajtra' / '12.8.' = planned day, 'do piatku' / 'do 31.3.' = due date, '15:00' time, '!1' '!2' '!3' priority, '@kontext', '#tag', '+projekt', '30m' / '2h' estimate, '!!nizka' '!!stredna' '!!vysoka' energy. The words 'písomka', 'test', 'previerka', 'skúška' create an exam event and 'skúšanie' an oral exam (e.g. 'písomka z fyziky v piatok') — avoid them in ordinary task titles. Without a day the task goes to the inbox unless `date` is given.",
      inputSchema: {
        text: z.string().min(1).max(500).describe("The capture line, e.g. 'zavolať Petrovi zajtra 15:00 !1 15m'."),
        date: dateSchema.optional().describe("Default planned day when the text names none, YYYY-MM-DD."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ text, date }) => {
      const result = await quickCapture(text, date !== undefined ? { defaultPlannedDate: date } : undefined);
      if (!result.ok) return errorResult(result.error);
      return jsonResult({ created: result.data });
    },
  );

  server.registerTool(
    "plan_task",
    {
      title: "Naplánovať úlohu",
      description:
        "Plan a task on a day (also sorts it out of the inbox), or move it to the 'Niekedy' (someday) list with date=null. Moving a task to a later day counts as postponing; after several postponements the app requires a short reason — if the call fails with that, ask the user why and retry with `reason`.",
      inputSchema: {
        task_id: idSchema,
        date: dateSchema.nullable().describe("YYYY-MM-DD, or null for the someday list."),
        reason: z.string().max(300).optional().describe("Why it is postponed again. Required only when the app asks for it."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ task_id, date, reason }) => {
      const user = await requireUser();
      if (date === null) {
        // To isté ako „Niekedy" v inboxe — úloha dostane vlastné miesto, nie prázdny deň.
        const result = await moveToSomeday(task_id);
        if (!result.ok) return errorResult(result.error);
        return jsonResult({ ok: true, task: await taskAfter(user.id, task_id) });
      }
      const result = await rescheduleTask(task_id, date, reason !== undefined ? { reason } : undefined);
      if (!result.ok) {
        if (result.code === "postpone_blocked") {
          return errorResult(
            `${result.error} Ask the user for a short reason and call plan_task again with \`reason\`.`,
          );
        }
        return errorResult(result.error);
      }
      /*
        Z inboxu úloha naplánovaním odchádza — rovnako ako tlačidlá „dnes"
        a „zajtra" pri triedení inboxu (`planOnDay`). Samotný presun dňa
        stav nemení, takže by ostala visieť v inboxe aj s dátumom.
      */
      const before = await getTask(user.id, task_id);
      if (before?.status === "inbox") {
        const sorted = await updateTask(task_id, { status: "todo" });
        if (!sorted.ok) return errorResult(sorted.error);
      }
      return jsonResult({ ok: true, task: await taskAfter(user.id, task_id) });
    },
  );

  server.registerTool(
    "drop_task",
    {
      title: "Zahodiť úlohu",
      description:
        "Drop a task — a conscious decision not to do it. It stays in the app's archive and can be restored there or with reopen_task; nothing is deleted. For recurring tasks the next occurrence is created.",
      inputSchema: { task_id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ task_id }) => {
      const user = await requireUser();
      const result = await dropTask(task_id);
      if (!result.ok) return errorResult(result.error);
      return jsonResult({ ok: true, task: await taskAfter(user.id, task_id), nextOccurrence: result.data.nextDate ?? null });
    },
  );

  server.registerTool(
    "complete_task",
    {
      title: "Odškrtnúť úlohu",
      description: "Mark a task as done. Calling it on a task that is already done changes nothing. Undo with reopen_task.",
      inputSchema: { task_id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ task_id }) => {
      const user = await requireUser();
      const before = await getTask(user.id, task_id);
      if (before === null) return errorResult("Úloha sa nenašla.");
      // Akcia v appke je prepínač — na hotovej úlohe by ju znova otvorila.
      if (before.status === "done") return jsonResult({ ok: true, alreadyDone: true, task: mcpTask(before) });
      const result = await toggleTaskDone(task_id);
      if (!result.ok) return errorResult(result.error);
      return jsonResult({ ok: true, task: await taskAfter(user.id, task_id), nextOccurrence: result.data.nextDate ?? null });
    },
  );

  server.registerTool(
    "set_priority_of_day",
    {
      title: "Priorita dňa",
      description:
        "Make a task the priority of the day (the one thing that makes the day a success), or unset it with on=false. Only one per day — setting a new one replaces the previous. The task must be planned for that day.",
      inputSchema: {
        task_id: idSchema,
        on: z.boolean().optional().describe("false removes the priority. Default true."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ task_id, on }) => {
      const user = await requireUser();
      const result = await setFrog(task_id, on ?? true);
      if (!result.ok) return errorResult(result.error);
      return jsonResult({ ok: true, task: await taskAfter(user.id, task_id) });
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "Upraviť úlohu",
      description:
        "Edit fields of an existing task. Send only what changes; null clears a field. The planned DAY is not changed here — use plan_task for that (it guards repeated postponing). project, area and subject take the names shown in task outputs or get_structure (subject = code like 'MAT' or its full name); an unknown name fails with the list of valid names. note replaces the whole note — if the task shows noteTruncated, use append_note so the rest is not lost. Setting a time on an all-day task makes it a timed task. Returns the task after the change and which fields changed.",
      inputSchema: {
        task_id: idSchema,
        title: z.string().min(1).max(500).optional(),
        note: z.string().max(10_000).nullable().optional().describe("Replaces the whole note; null clears it."),
        append_note: z.string().min(1).max(2_000).optional().describe("Adds a paragraph at the end of the note."),
        due: dateSchema.nullable().optional().describe("Due date (termín), YYYY-MM-DD, or null to clear."),
        time: timeSchema.nullable().optional().describe("Time on the planned day, HH:MM, or null to clear."),
        estimate_min: z.number().int().min(1).max(1440).nullable().optional().describe("Estimate in minutes, or null."),
        priority: z.number().int().min(1).max(3).optional().describe("1 highest, 2 high, 3 normal."),
        energy: z.enum(["low", "mid", "high"]).nullable().optional().describe("Energy the task needs, or null."),
        context: z.string().max(64).nullable().optional().describe("Context such as '@doma' or '@počítač', or null."),
        all_day: z.boolean().optional().describe("The task takes the whole day — it fills the day's time budget."),
        project: nameSchema.nullable().optional().describe("Project name (or id), or null to remove it from its project."),
        area: nameSchema.nullable().optional().describe("Area name (or id), or null."),
        subject: nameSchema.nullable().optional().describe("School subject code ('MAT') or name, or null."),
        add_tags: z.array(z.string().min(1).max(64)).max(10).optional().describe("Tag names to add; a new tag is created."),
        remove_tags: z.array(z.string().min(1).max(64)).max(10).optional().describe("Tag names to remove from the task."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ task_id, project, area, subject, add_tags, remove_tags, ...fields }) => {
      const user = await requireUser();
      const before = await getTask(user.id, task_id);
      if (before === null) return errorResult("Úloha sa nenašla.");

      /* Najprv všetko overiť — mená aj štítky — a až potom zapisovať. */
      const refs: TaskRefs = {};
      for (const [kind, input] of [["project", project], ["area", area], ["subject", subject]] as const) {
        if (input === undefined) continue;
        const resolved = await resolveRef(user.id, kind, input);
        if (!resolved.ok) return errorResult(resolved.error);
        refs[kind === "project" ? "projectId" : kind === "area" ? "areaId" : "subjectId"] = resolved.id;
      }
      const tags = tagChanges(before.tags, add_tags, remove_tags);
      if (!tags.ok) return errorResult(tags.error);
      const patch = taskPatch(before, fields, refs);
      if (!patch.ok) return errorResult(patch.error);

      const done: string[] = [];
      if (Object.keys(patch.patch).length > 0) {
        const result = await updateTask(task_id, patch.patch);
        if (!result.ok) return errorResult(result.error);
        done.push("task fields");
      }
      for (const name of tags.add) {
        const result = await attachTag(task_id, name);
        if (!result.ok) return failedAfter(done, result.error);
        done.push(`tag ${name} added`);
      }
      for (const tagId of tags.removeIds) {
        const result = await detachTag(task_id, tagId);
        if (!result.ok) return failedAfter(done, result.error);
        done.push("tag removed");
      }

      const after = await getTask(user.id, task_id);
      if (after === null) return errorResult("Úloha sa po úprave nenašla.");
      const view = mcpTask(after, true);
      return jsonResult({ ok: true, changed: changedFields(mcpTask(before, true), view), task: view });
    },
  );

  server.registerTool(
    "reopen_task",
    {
      title: "Vrátiť úlohu",
      description:
        "Undo complete_task or drop_task: a done task becomes open again, a dropped task is restored (to its day or project, otherwise to the inbox). A task deleted in the app comes back from the archive as it was. Recurring tasks: the next occurrence created when this one was completed or dropped is NOT removed — the result lists the other open occurrences; tell the user and, if they want, drop the duplicate with drop_task.",
      inputSchema: { task_id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ task_id }) => {
      const user = await requireUser();
      const before = await getTask(user.id, task_id);

      if (before === null) {
        /* Živá úloha to nie je — môže byť zmazaná v appke. Vráti ju „Vrátiť" z archívu. */
        const restored = await restoreTask(task_id);
        if (!restored.ok) return errorResult("Úloha sa nenašla.");
        return jsonResult({ ok: true, restoredFromDeleted: true, task: await taskAfter(user.id, task_id) });
      }

      if (before.status === "done") {
        // Rovnaký prepínač ako odškrtávacie políčko — na hotovej úlohe ju otvorí.
        const result = await toggleTaskDone(task_id);
        if (!result.ok) return errorResult(result.error);
      } else if (before.status === "dropped") {
        const result = await restoreTask(task_id);
        if (!result.ok) return errorResult(result.error);
      } else {
        return jsonResult({ ok: true, alreadyOpen: true, task: mcpTask(before) });
      }

      const after = await getTask(user.id, task_id);
      const occurrences =
        before.recurrenceRule !== null
          ? (await getOpenOccurrences(user.id, before.recurrenceParentId ?? before.id)).filter(
              (task) => task.id !== task_id,
            )
          : [];
      return jsonResult({
        ok: true,
        reopened: `${before.status} → ${after?.status ?? "?"}`,
        task: after === null ? null : mcpTask(after),
        ...(before.recurrenceRule !== null
          ? {
              otherOpenOccurrences: occurrences.map((task) => mcpTask(task)),
              note: "Recurring task: occurrences created by completing or dropping it were kept.",
            }
          : {}),
      });
    },
  );

  /* ── udalosti a deadliny ─────────────────────────────────────────────── */

  server.registerTool(
    "create_event",
    {
      title: "Nová udalosť",
      description:
        "Create an event, exam, oral exam, deadline or trip with explicit fields (capture only turns exam keywords into events). kind follows from type when omitted: submit → deadline, exam/oral → event. An exam with a subject and no time takes the subject's lesson from the timetable and gets a reminder the evening before, like in the app. Check get_day/get_upcoming first so you don't create a duplicate.",
      inputSchema: {
        title: z.string().min(1).max(500),
        date: dateSchema.describe("Day of the event or deadline (first day of a multi-day event), YYYY-MM-DD."),
        kind: kindSchema.optional(),
        type: typeSchema.optional(),
        end_date: dateSchema.nullable().optional().describe("Last day of a multi-day event (events only)."),
        start_time: timeSchema.nullable().optional().describe("Start, HH:MM (events only). Omit for all day."),
        end_time: timeSchema.nullable().optional().describe("End of an event, or the 'due by' time of a deadline."),
        place: z.string().max(200).nullable().optional(),
        subject: nameSchema.nullable().optional().describe("School subject code ('MAT') or name."),
        note: z.string().max(10_000).nullable().optional(),
        blocks_day: z.boolean().optional().describe("Takes the whole day (trip) — the day is shown as busy. Default: true for multi-day events."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ subject, ...fields }) => {
      const user = await requireUser();
      let subjectId: string | null = null;
      if (subject !== undefined && subject !== null) {
        const resolved = await resolveRef(user.id, "subject", subject);
        if (!resolved.ok) return errorResult(resolved.error);
        subjectId = resolved.id;
      }
      const draft = agendaCreateInput(fields, subjectId);
      if (!draft.ok) return errorResult(draft.error);
      const result = await createAgendaItem(draft.input);
      if (!result.ok) return errorResult(result.error);
      const item = await getAgendaItem(user.id, result.data.id);
      return jsonResult({
        ok: true,
        event: item === null ? { id: result.data.id } : mcpAgenda(item, todayIn(user.settings.timezone)),
      });
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Upraviť udalosť",
      description:
        "Edit an event, exam, oral exam, deadline or trip (ids from get_day, get_upcoming or search). Send only what changes; null clears a field. A new date moves it like the app's Move button: a multi-day event moves whole and an exam finds its subject's lesson on the new day. Unfinished tasks under the event (exam prep, see `prep`) stay where they are unless shift_tasks is true — ask the user before moving them. cancelled=true keeps it crossed out in the list; nothing is deleted. grade 1–5 (null clears) is only for exams and oral exams. An exam keeps its timetable time unless you set start_time/end_time.",
      inputSchema: {
        event_id: idSchema,
        title: z.string().min(1).max(500).optional(),
        kind: kindSchema.optional(),
        type: typeSchema.optional(),
        date: dateSchema.optional().describe("New day (first day of a multi-day event), YYYY-MM-DD."),
        end_date: dateSchema.nullable().optional().describe("Last day of a multi-day event (events only), or null for a single day."),
        start_time: timeSchema.nullable().optional().describe("Start, HH:MM (events only); null = all day."),
        end_time: timeSchema.nullable().optional().describe("End of an event, or the 'due by' time of a deadline; null clears."),
        place: z.string().max(200).nullable().optional(),
        subject: nameSchema.nullable().optional().describe("School subject code ('MAT') or name, or null."),
        note: z.string().max(10_000).nullable().optional().describe("Replaces the whole note; null clears it."),
        blocks_day: z.boolean().optional().describe("Takes the whole day (trip) — the day is shown as busy."),
        cancelled: z.boolean().optional().describe("true = cancelled (stays crossed out), false = restore."),
        grade: z.number().int().min(1).max(5).nullable().optional().describe("Grade 1–5 after an exam, or null to clear."),
        grade_note: z.string().max(500).nullable().optional().describe("Short note to the grade."),
        shift_tasks: z.boolean().optional().describe("With a new date: also move unfinished tasks under the event by the same number of days (not counted as postponing). Default false."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ event_id, subject, shift_tasks, ...edit }) => {
      const user = await requireUser();
      const todayIso = todayIn(user.settings.timezone);
      const current = await getAgendaItem(user.id, event_id);
      if (current === null) return errorResult("Udalosť sa nenašla.");

      let subjectId: string | null | undefined;
      if (subject !== undefined) {
        const resolved = await resolveRef(user.id, "subject", subject);
        if (!resolved.ok) return errorResult(resolved.error);
        subjectId = resolved.id;
      }
      const plan = planAgendaEdit(current, edit, subjectId);
      if (!plan.ok) return errorResult(plan.error);

      /*
        Kroky ako v detaile udalosti: presun (s posunom úloh pod udalosťou,
        ak ho človek chce), formulár, zrušenie, známka. Všetko je overené
        vopred, takže zlyhať môže už len zápis.
      */
      const done: string[] = [];
      let tasksUnderEvent: Record<string, unknown> | null = null;
      if (plan.move !== null) {
        const moved = await moveAgendaItem(event_id, plan.move);
        if (!moved.ok) return errorResult(moved.error);
        done.push(`moved to ${plan.move}`);
        const pending = moved.data.pendingTaskIds;
        if (pending.length > 0 && shift_tasks === true) {
          const shifted = await shiftPrep(event_id, moved.data.delta, pending);
          if (!shifted.ok) return failedAfter(done, shifted.error);
          done.push("tasks under the event shifted");
          tasksUnderEvent = { shifted: shifted.data.moved, byDays: moved.data.delta };
        } else if (pending.length > 0) {
          tasksUnderEvent = {
            notMoved: (await getTasksByIds(user.id, pending)).map((task) => mcpTask(task)),
            note: "These unfinished tasks under the event stayed on their days. Ask the user whether to move them (plan_task each).",
          };
        }
      }
      if (plan.form) {
        const fresh = plan.move !== null ? await getAgendaItem(user.id, event_id) : current;
        if (fresh === null) return failedAfter(done, "Udalosť sa nenašla.");
        const wanted = lessonSlotWanted(fresh, edit, subjectId);
        const slot = wanted !== null ? await lessonSlotFor(user.id, wanted.subjectId, wanted.date) : null;
        const result = await updateAgendaItem(event_id, agendaForm(fresh, edit, subjectId, slot));
        if (!result.ok) return failedAfter(done, result.error);
        done.push("fields updated");
      }
      if (plan.cancelled !== undefined) {
        const result = await setAgendaCancelled(event_id, plan.cancelled);
        if (!result.ok) return failedAfter(done, result.error);
        done.push(plan.cancelled ? "cancelled" : "restored");
      }
      if (plan.grade !== undefined) {
        const result = await setAgendaGrade(event_id, plan.grade.grade, plan.grade.note);
        if (!result.ok) return failedAfter(done, result.error);
      }

      const after = await getAgendaItem(user.id, event_id);
      if (after === null) return errorResult("Udalosť sa po úprave nenašla.");
      const view = mcpAgenda(after, todayIso);
      return jsonResult({
        ok: true,
        changed: changedFields(mcpAgenda(current, todayIso), view),
        event: view,
        ...(tasksUnderEvent !== null ? { tasksUnderEvent } : {}),
      });
    },
  );

  /* ── ranný rituál ────────────────────────────────────────────────────── */

  server.registerTool(
    "start_morning_ritual",
    {
      title: "Začať ranný rituál",
      description:
        "Start the morning routine: catches up recurring tasks that are due (same as opening the ritual in the app) and returns today's overview. Then go through overdue tasks, pick the priority of the day, check the time budget and call finish_morning_ritual.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const user = await requireUser();
      const todayIso = todayIn(user.settings.timezone);
      const caught = await materializeDueRecurrences(todayIso);
      return jsonResult({
        recurringCreated: caught.ok ? caught.data.created : 0,
        day: await dayOverview(user, todayIso),
      });
    },
  );

  server.registerTool(
    "finish_morning_ritual",
    {
      title: "Uzavrieť ranný rituál",
      description:
        "Mark today's morning routine as done in the app, so it won't open the ritual again today. Call it after the overdue tasks are decided and the priority of the day is set.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const user = await requireUser();
      const todayIso = todayIn(user.settings.timezone);
      const period = ritualPeriod("daily_plan", todayIso, user.settings.weekStartsOn);
      const state = await getRitualState(user.id, "daily_plan", period);
      if (state.completed) return jsonResult({ ok: true, alreadyDone: true });
      /*
        Ranné plánovanie nemá vlastné odpovede — všetko, čo sa v ňom rozhodne,
        je zapísané na úlohách. Rovnako ako sprievodca v appke preto ukladá
        prázdny záznam; ten hovorí len „dnes už prebehlo".
      */
      const result = await completeRitual("daily_plan", period, {});
      if (!result.ok) return errorResult(result.error);
      return jsonResult({ ok: true, date: todayIso });
    },
  );

  server.registerPrompt(
    "ranny-ritual",
    {
      title: "Ranný rituál",
      description: "Prejdi so mnou ranný rituál v Task manažéri a zhrň mi deň.",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Urob so mnou ranný rituál v Task manažéri. Zavolaj start_morning_ritual a zhrň mi deň: školu, porady, udalosti a písomky, čo mám naplánované a koľko voľného času zostáva. " +
              "Potom prejdi prepadnuté úlohy a ku každej navrhni: dnes, iný deň, alebo zahodiť — a počkaj, kým rozhodnem. " +
              "Navrhni jednu prioritu dňa a po mojom súhlase ju nastav. Ak je deň preplnený, navrhni, čo presunúť. Nakoniec uzavri rituál cez finish_morning_ritual. Odpovedaj po slovensky, stručne.",
          },
        },
      ],
    }),
  );

  return server;
}

import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { addDays, todayIn } from "@/lib/dates";
import { ritualPeriod } from "@/lib/rituals";
import { requireUser } from "@/server/auth-guard";
import { completeRitual } from "@/server/actions/rituals";
import {
  dropTask,
  materializeDueRecurrences,
  moveToSomeday,
  quickCapture,
  rescheduleTask,
  setFrog,
  toggleTaskDone,
  updateTask,
} from "@/server/actions/tasks";
import { getAgendaForRange } from "@/server/queries/agenda";
import { getRitualState } from "@/server/queries/rituals";
import { search } from "@/server/queries/search";
import { getInboxTasks, getTask, getTasksForRange } from "@/server/queries/tasks";

import { dayOverview } from "./day";
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

Use only task IDs returned by the tools. Nothing is ever hard-deleted: drop_task marks a task as dropped (recoverable in the app's archive).`;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const idSchema = z.string().min(1).max(64);

/** Zhrnutie výsledku akcie s aktuálnym stavom úlohy — model vidí, čo sa naozaj stalo. */
async function taskAfter(userId: string, id: string) {
  const task = await getTask(userId, id);
  return task === null ? null : mcpTask(task);
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
        "Full-text search across tasks, events, ideas, projects, areas and the journal, including done, dropped and past items. Accent-insensitive.",
      inputSchema: { query: z.string().min(2).max(200) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const user = await requireUser();
      const hits = await search(user.id, query, { todayIso: todayIn(user.settings.timezone), limit: 25 });
      return jsonResult(
        hits.map(({ kind, id, title, snippet, meta, archived, archivedLabel }) => ({
          kind,
          id,
          title,
          snippet,
          meta,
          archived: archived ? (archivedLabel ?? "v archíve") : false,
        })),
      );
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
        "Drop a task — a conscious decision not to do it. It stays in the app's archive and can be restored there; nothing is deleted. For recurring tasks the next occurrence is created.",
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
      description: "Mark a task as done. Calling it on a task that is already done changes nothing.",
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

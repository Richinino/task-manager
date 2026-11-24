import "server-only";

import { and, eq, isNull, or, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { taggables, tags, taskEvents, tasks, type Task } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { catchUpOccurrence, parseRecurrence } from "@/lib/recurrence";
import { horizonForDate } from "@/lib/task-placement";
import { endFocusForTask } from "@/server/focus-write";

/*
  Zápisy nad úlohou, ktoré potrebuje viac než jedno miesto. Žijú mimo
  `actions/tasks.ts` preto, že modul s `"use server"` smie von vydávať iba
  verejné akcie — a funkcia, ktorá berie transakciu, ním nie je.
*/

/** Transakcia z `db.transaction` — rovnaké dotazy ako `Database`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Zámok na dobu transakcie, pomenovaný kľúčom.
 *
 * Niektoré pravidlá sa nedajú postaviť na jedinečný index: „jedna priorita
 * dňa" (úloha sa na obsadený deň smie presunúť) a „jeden výskyt opakovania
 * na deň" (človek smie výskyt ručne presunúť na deň iného). Kontrola
 * „pozri sa, potom zapíš" je pri dvoch súbežných požiadavkách deravá — obe
 * sa pozrú skôr, než jedna zapíše. Zámok ich zoradí za seba: druhá počká,
 * kým prvá neskončí, a potom už jej zápis vidí.
 *
 * `pg_advisory_xact_lock` sa uvoľní sám koncom transakcie. Beží na Neone
 * aj v PGlite — je to jadro Postgresu, nie rozšírenie.
 */
export async function lockFor(tx: Tx, scope: string, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${scope}), hashtext(${key}))`);
}

/** Koreň reťazca opakovania — na ňom visia všetky výskyty. */
export function recurrenceRootId(task: Task): string {
  return task.recurrenceParentId ?? task.id;
}

/**
 * Dni, na ktoré už reťazec výskyt má — vrátane zmazaných.
 *
 * Zmazaný výskyt sa počíta zámerne: kto ho zmazal, nechcel ho, a dobiehanie
 * ho nesmie vzkriesiť. Predtým sa zmazané nerátali a ranný sprievodca
 * zmazaný výskyt na druhý deň založil znova.
 */
async function chainDates(tx: Tx, userId: string, rootId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ plannedDate: tasks.plannedDate })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        or(eq(tasks.id, rootId), eq(tasks.recurrenceParentId, rootId)),
      ),
    );
  return new Set(
    rows.map((row) => row.plannedDate).filter((date): date is string => date !== null),
  );
}

/**
 * Založí ďalší výskyt opakovanej úlohy. Vráti jeho deň, alebo `null`.
 *
 * **Deň** počíta `catchUpOccurrence`: ďalší podľa pravidla, a keď ten už
 * prešiel, najnovší, ktorý je práve na rade. Predtým vznikal holý ďalší
 * výskyt — pri úlohe zameškanej o tri týždne teda zase v minulosti.
 *
 * **Kopíruje sa všetko, čo hovorí, AKÁ je to práca**: názov, poznámka,
 * priorita, odhad, energia, kontext, zaradenie, predmet a druh školskej
 * práce, lekcia (pilier, zručnosť), návyk, celodennosť, viazanosť na deň
 * a štítky. Predtým sa „viazaná na deň" nekopírovala — a tá je pri
 * opakovaných veciach najčastejšia („tréning je buď v utorok, alebo nebol").
 * Ani návyk: druhý tréning sa už návyku nezarátal.
 *
 * NEKOPÍRUJE sa `postponeCount`, `isFrog` ani termín — nový výskyt začína
 * s čistým štítom a termín patrí konkrétnemu výskytu.
 */
export async function spawnNextOccurrence(
  tx: Tx,
  userId: string,
  task: Task,
  todayIso: string,
): Promise<string | null> {
  const rule = parseRecurrence(task.recurrenceRule);
  if (rule === null) return null;

  // Základom je deň, na ktorý bola úloha naplánovaná; keď žiadny nemala,
  // počíta sa od dnešku.
  const base = task.plannedDate ?? todayIso;
  const next = catchUpOccurrence(rule, base, todayIso);
  if (next === null) return null;

  const rootId = recurrenceRootId(task);

  /*
    Poistka proti dvojitému založeniu: dve rýchle odškrtnutia, ranný
    sprievodca aj odškrtnutie staršieho výskytu mieria na ten istý deň.
    Zámok reťazca zoradí súbežné pokusy za seba, takže druhý už prvý výskyt
    vidí. Jedinečný index tu nejde — človek smie výskyt ručne presunúť na
    deň, ktorý už iný výskyt má.
  */
  await lockFor(tx, "recurrence", rootId);
  if ((await chainDates(tx, userId, rootId)).has(next)) return null;

  const id = uuidv7();
  await tx.insert(tasks).values({
    id,
    userId,
    title: task.title,
    note: task.note,
    status: "todo",
    priority: task.priority,
    plannedDate: next,
    plannedTime: task.plannedTime,
    horizon: horizonForDate(next, todayIso),
    estimateMin: task.estimateMin,
    energy: task.energy,
    context: task.context,
    projectId: task.projectId,
    areaId: task.areaId,
    subjectId: task.subjectId,
    schoolKind: task.schoolKind,
    lessonPillarId: task.lessonPillarId,
    lessonSkillId: task.lessonSkillId,
    habitId: task.habitId,
    allDay: task.allDay,
    staysOnDay: task.staysOnDay,
    recurrenceRule: task.recurrenceRule,
    recurrenceParentId: rootId,
  });

  /* Štítky sú samostatné riadky, preto sa kopírujú zvlášť. */
  const sourceTags = await tx
    .select({ tagId: taggables.tagId })
    .from(taggables)
    .innerJoin(tags, eq(taggables.tagId, tags.id))
    .where(
      and(
        eq(tags.userId, userId),
        eq(taggables.entityType, "task"),
        eq(taggables.entityId, task.id),
      ),
    );
  if (sourceTags.length > 0) {
    await tx
      .insert(taggables)
      .values(
        sourceTags.map((row) => ({
          tagId: row.tagId,
          entityType: "task" as const,
          entityId: id,
        })),
      )
      .onConflictDoNothing();
  }

  await tx.insert(taskEvents).values({
    id: uuidv7(),
    userId,
    taskId: id,
    type: "created",
    toValue: next,
    note: "opakovanie",
  });

  return next;
}

/**
 * Jadro odškrtnutia úlohy ako hotovej — spoločné pre `toggleTaskDone` aj
 * `finishFocus`, aby sa dokončenie nikde nerobilo „trochu inak".
 *
 * V jednej transakcii: stav, záznam v histórii, ukončenie bežiaceho fokusu
 * a založenie ďalšieho výskytu opakovania. Keby výskyt zlyhal po odškrtnutí,
 * ďalší pokus by už videl hotovú úlohu a výskyt by nevznikol.
 *
 * Opakovanie zakladá len dokončenie, nie vrátenie späť: odškrtnutie omylom
 * by inak nechalo v zozname sirotu, ktorú by nikto nečakal.
 *
 * Vráti deň ďalšieho výskytu, alebo `null`.
 */
export async function completeTaskInTx(
  tx: Tx,
  userId: string,
  task: Task,
  todayIso: string,
): Promise<string | null> {
  await tx
    .update(tasks)
    .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, task.id), eq(tasks.userId, userId), isNull(tasks.deletedAt)));

  await tx.insert(taskEvents).values({
    id: uuidv7(),
    userId,
    taskId: task.id,
    type: "completed",
    fromValue: task.status,
    toValue: "done",
  });

  await endFocusForTask(tx, userId, task.id, "done");

  return spawnNextOccurrence(tx, userId, task, todayIso);
}

"use server";

import { requireUser } from "@/server/auth-guard";
import { getSubtasks, getTaskTags, listTags } from "@/server/queries/structure";

/* ═══════════════════════════════════════════════════════════════════════════
   DOČÍTANIE DETAILU ÚLOHY

   Panel s detailom sa otvára z klienta a dostáva hotový objekt úlohy
   (`TaskWithRelations`). Ten podúlohy ani štítky nenesie — `getSubtasks`,
   `getTaskTags` a `listTags` sú čítacie dotazy označené `server-only`,
   takže sa z prehliadača zavolať nedajú.

   Tento modul je jediný most cez tú hranicu: jedna akcia, ktorá si sama
   overí používateľa a vráti presne to, čo panel kreslí. Zámerne nevracia
   celé riadky z databázy, ale orezané pohľady — cez hranicu putuje len to,
   čo sa naozaj zobrazuje.

   Býva to súčasť čítacej vrstvy, tá je však uzavretá (`src/server/**`).
   Kým tam pribudne, žije most tu, vedľa komponentu, ktorý ho používa.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Podúloha tak, ako ju kreslí kontrolný zoznam. */
export interface SubtaskView {
  id: string;
  title: string;
  done: boolean;
}

/** Štítok bez počtov — v detaile ide len o meno. */
export interface TagView {
  id: string;
  name: string;
}

export interface TaskExtras {
  subtasks: SubtaskView[];
  /** Štítky priradené tejto úlohe. */
  tags: TagView[];
  /** Všetky štítky používateľa — návrhy do poľa, od najpoužívanejších. */
  suggestions: TagView[];
}

export type TaskExtrasResult =
  | { ok: true; data: TaskExtras }
  | { ok: false; error: string };

/**
 * Načíta podúlohy, štítky úlohy a číselník štítkov naraz.
 *
 * `requireUser()` je zámerne mimo `try` — presmerovanie neprihláseného
 * pracuje s výnimkou a `catch` by ho premenil na hlášku „nepodarilo sa".
 */
export async function loadTaskExtras(taskId: string): Promise<TaskExtrasResult> {
  const user = await requireUser();
  try {
    const [subtasks, tags, all] = await Promise.all([
      getSubtasks(user.id, taskId),
      getTaskTags(user.id, taskId),
      listTags(user.id),
    ]);

    return {
      ok: true,
      data: {
        subtasks: subtasks.map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          done: subtask.status === "done",
        })),
        tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
        // Najprv to, čo používateľ používa najčastejšie — abecedný číselník
        // je pri desiatkach štítkov na návrhy nepoužiteľný.
        suggestions: [...all]
          .sort(
            (a, b) =>
              b.taskCount - a.taskCount || a.name.localeCompare(b.name, "sk"),
          )
          .map((tag) => ({ id: tag.id, name: tag.name })),
      },
    };
  } catch (error) {
    console.error("[task-detail-data] loadTaskExtras", error);
    return { ok: false, error: "Podúlohy a štítky sa nepodarilo načítať." };
  }
}

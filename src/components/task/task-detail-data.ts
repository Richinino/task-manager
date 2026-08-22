"use server";

import { parseWikiLinks } from "@/lib/wikilink";
import { requireUser } from "@/server/auth-guard";
import { getBacklinks, resolveLinkTargets } from "@/server/queries/links";
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

/** Cieľ odkazu `[[…]]` nájdený v poznámke. */
export interface LinkTargetView {
  kind: "task" | "idea" | "project" | "area" | "journal";
  id: string;
  name: string;
}

/** Entita, ktorá odkazuje na túto úlohu. */
export interface BacklinkView {
  kind: "task" | "idea" | "project" | "area" | "journal";
  id: string;
  title: string;
}

export interface TaskExtras {
  subtasks: SubtaskView[];
  /** Štítky priradené tejto úlohe. */
  tags: TagView[];
  /** Všetky štítky používateľa — návrhy do poľa, od najpoužívanejších. */
  suggestions: TagView[];
  /**
   * Entity, na ktoré odkazuje poznámka. Odkazy bez cieľa sa nevracajú —
   * ostanú obyčajným textom, presne ako v `WikiLinkText`.
   */
  linkTargets: LinkTargetView[];
  /**
   * Kto odkazuje SEM. Druhá polovica odkazov `[[…]]` — bez nej vedú len
   * jedným smerom a nedá sa zistiť, čo od tejto úlohy závisí.
   */
  backlinks: BacklinkView[];
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
export async function loadTaskExtras(
  taskId: string,
  /** Poznámka úlohy — z nej sa prekladajú odkazy `[[…]]`. */
  note: string | null,
): Promise<TaskExtrasResult> {
  const user = await requireUser();
  try {
    // Prázdna poznámka sa na server vôbec nepýta — bez odkazov nie je čo hľadať.
    const labels = note === null ? [] : parseWikiLinks(note).map((link) => link.label);

    const [subtasks, tags, all, targets, backlinks] = await Promise.all([
      getSubtasks(user.id, taskId),
      getTaskTags(user.id, taskId),
      listTags(user.id),
      labels.length > 0
        ? resolveLinkTargets(user.id, labels)
        : Promise.resolve(new Map()),
      getBacklinks(user.id, "task", taskId),
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
        linkTargets: [...targets.values()],
        backlinks,
      },
    };
  } catch (error) {
    console.error("[task-detail-data] loadTaskExtras", error);
    return { ok: false, error: "Podúlohy a štítky sa nepodarilo načítať." };
  }
}

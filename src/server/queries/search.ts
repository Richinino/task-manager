import "server-only";

import { and, eq, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { areas, ideas, journal, projects, tasks } from "@/db/schema";
import { FOLD_FROM, FOLD_TO, fold } from "@/lib/fold";

/* ═══════════════════════════════════════════════════════════════════════════
   FULLTEXT

   Hľadá naprieč úlohami, nápadmi, projektmi, oblasťami a denníkom — vrátane
   toho, čo je uzavreté alebo mäkko zmazané. Práve staré veci sa hľadajú
   najčastejšie; to, čo je na obrazovke, netreba hľadať.

   Skladá sa `translate()`, nie `unaccent`: to je rozšírenie, ktoré Neon má
   a PGlite nemusí. Dvojice písmen prichádzajú z `@/lib/fold`, aby paleta
   v prehliadači a server skladali rovnako — podrobnosti tam.

   `ILIKE`, nie `to_tsvector`: slovenský slovník Postgres nemá, takže by
   stemming aj tak nefungoval, a pri osobnej appke ide o tisíce riadkov.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SearchKind = "task" | "idea" | "project" | "area" | "journal";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** Kúsok textu, v ktorom sa zhoda našla. `null`, keď je zhoda v názve. */
  snippet: string | null;
  href: string;
  /** Uzavreté, zahodené alebo mäkko zmazané — v zozname sa stlmí. */
  archived: boolean;
}

/** `lower(translate(stĺpec, …))` — presne to, čo robí `fold()` v JavaScripte. */
function folded(column: AnyPgColumn): SQL {
  return sql`lower(translate(coalesce(${column}, ''), ${FOLD_FROM}, ${FOLD_TO}))`;
}

/** Zhoda kdekoľvek v stĺpci, po zložení diakritiky na oboch stranách. */
function matches(column: AnyPgColumn, needle: string): SQL {
  return sql`${folded(column)} like ${`%${needle}%`}`;
}

/**
 * Kúsok textu okolo zhody.
 *
 * Ukázať celú poznámku by zoznam rozbilo, ukázať jej začiatok by zhodu
 * nemuselo obsahovať vôbec. Výrez sa preto berie okolo nájdeného miesta.
 */
function snippetAround(text: string | null, needle: string, radius = 40): string | null {
  if (text === null || text.trim() === "") return null;

  const index = fold(text).indexOf(needle);
  if (index < 0) return null;

  const from = Math.max(0, index - radius);
  const to = Math.min(text.length, index + needle.length + radius);

  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

/**
 * Hľadanie naprieč appkou.
 *
 * Prázdny alebo jednoznakový dopyt vráti prázdno — jedno písmeno by vrátilo
 * celú databázu a to nie je výsledok hľadania, ale výpis.
 */
export async function search(
  userId: string,
  query: string,
  limit = 40,
): Promise<SearchHit[]> {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];

  const db = await getDb();
  const perKind = Math.max(5, Math.ceil(limit / 3));

  const [taskRows, ideaRows, projectRows, areaRows, journalRows] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        note: tasks.note,
        context: tasks.context,
        status: tasks.status,
        deletedAt: tasks.deletedAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          or(
            matches(tasks.title, needle),
            matches(tasks.note, needle),
            // Kontext bol doteraz mimo hľadania, hoci je to jediný spôsob,
            // ako nájsť „všetko, čo sa dá vybaviť v meste".
            matches(tasks.context, needle),
          ),
        ),
      )
      .limit(perKind),

    db
      .select({
        id: ideas.id,
        title: ideas.title,
        body: ideas.body,
        stage: ideas.stage,
        deletedAt: ideas.deletedAt,
      })
      .from(ideas)
      .where(
        and(
          eq(ideas.userId, userId),
          or(matches(ideas.title, needle), matches(ideas.body, needle)),
        ),
      )
      .limit(perKind),

    db
      .select({
        id: projects.id,
        name: projects.name,
        goal: projects.goal,
        status: projects.status,
        deletedAt: projects.deletedAt,
      })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          or(matches(projects.name, needle), matches(projects.goal, needle)),
        ),
      )
      .limit(perKind),

    db
      .select({ id: areas.id, name: areas.name, deletedAt: areas.deletedAt })
      .from(areas)
      .where(and(eq(areas.userId, userId), matches(areas.name, needle)))
      .limit(perKind),

    db
      .select({ id: journal.id, date: journal.date, body: journal.body })
      .from(journal)
      .where(and(eq(journal.userId, userId), matches(journal.body, needle)))
      .limit(perKind),
  ]);

  const hits: SearchHit[] = [];

  for (const row of taskRows) {
    hits.push({
      kind: "task",
      id: row.id,
      title: row.title,
      // Keď zhoda sedí na kontext a nie na poznámku, ukáže sa kontext —
      // inak by výsledok vyzeral, akoby sa našiel bez dôvodu.
      snippet:
        snippetAround(row.note, needle) ??
        (row.context !== null && fold(row.context).includes(needle) ? row.context : null),
      // Úloha nemá vlastnú adresu — panel s detailom sa otvára z obrazoviek.
      href: "/dnes",
      archived:
        row.deletedAt !== null || row.status === "done" || row.status === "dropped",
    });
  }

  for (const row of ideaRows) {
    hits.push({
      kind: "idea",
      id: row.id,
      title: row.title,
      snippet: snippetAround(row.body, needle),
      href: "/napady",
      archived:
        row.deletedAt !== null || row.stage === "promoted" || row.stage === "rejected",
    });
  }

  for (const row of projectRows) {
    hits.push({
      kind: "project",
      id: row.id,
      title: row.name,
      snippet: snippetAround(row.goal, needle),
      href: `/projekty/${row.id}`,
      archived:
        row.deletedAt !== null || row.status === "done" || row.status === "dropped",
    });
  }

  for (const row of areaRows) {
    hits.push({
      kind: "area",
      id: row.id,
      title: row.name,
      snippet: null,
      href: "/oblasti",
      archived: row.deletedAt !== null,
    });
  }

  for (const row of journalRows) {
    hits.push({
      kind: "journal",
      id: row.id,
      title: `Denník — ${row.date}`,
      snippet: snippetAround(row.body, needle),
      href: "/dnes",
      archived: false,
    });
  }

  /*
    Živé pred archivovanými, potom zhoda v názve pred zhodou v texte. Kto
    hľadá, obyčajne hľadá niečo, čo ešte rieši — a keď nie, archivované sú
    hneď pod tým.
  */
  return hits
    .sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      const aTitle = fold(a.title).includes(needle) ? 0 : 1;
      const bTitle = fold(b.title).includes(needle) ? 0 : 1;
      if (aTitle !== bTitle) return aTitle - bTitle;
      return a.title.localeCompare(b.title, "sk");
    })
    .slice(0, limit);
}

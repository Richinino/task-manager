import "server-only";

import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { agendaItems, areas, ideas, journal, projects, schoolSubjects, tasks } from "@/db/schema";
import { agendaDateSk, isAgendaPast } from "@/lib/agenda";
import { FOLD_FROM, FOLD_TO, fold, likeContains } from "@/lib/fold";

/* ═══════════════════════════════════════════════════════════════════════════
   FULLTEXT

   Hľadá naprieč úlohami, nápadmi, projektmi, oblasťami, denníkom a udalosťami
   — vrátane toho, čo je uzavreté alebo mäkko zmazané. Práve staré veci sa
   hľadajú najčastejšie; to, čo je na obrazovke, netreba hľadať. Pri
   udalostiach doslova: „kedy sme mali tú písomku z funkcií?" je otázka na
   hľadanie, nie na zoznam, ktorý ukazuje, čo príde.

   Skladá sa `translate()`, nie `unaccent`: to je rozšírenie, ktoré Neon má
   a PGlite nemusí. Dvojice písmen prichádzajú z `@/lib/fold`, aby paleta
   v prehliadači a server skladali rovnako — podrobnosti tam.

   `ILIKE`, nie `to_tsvector`: slovenský slovník Postgres nemá, takže by
   stemming aj tak nefungoval, a pri osobnej appke ide o tisíce riadkov.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SearchKind = "task" | "idea" | "project" | "area" | "journal" | "event" | "deadline";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** Kúsok textu, v ktorom sa zhoda našla. `null`, keď je zhoda v názve. */
  snippet: string | null;
  href: string;
  /**
   * Krátky kontext za druhom — pri udalosti deň a predmet (`pi 2. 10. · MAT`).
   * Udalosť bez dňa vo výsledku nič nepovie: písomiek „Písomka" je v roku
   * dvadsať.
   */
  meta: string | null;
  /** Uzavreté, zahodené alebo mäkko zmazané — v zozname sa stlmí. */
  archived: boolean;
  /**
   * Štítok stlmeného zásahu, keď „v archíve" nesedí. Prebehnutá písomka nie
   * je v archíve — je len za nami.
   */
  archivedLabel?: string;
  /** Deň udalosti — len na poradie rovnomenných („Písomka" je ich dvadsať). */
  date?: string;
}

export interface SearchOptions {
  /**
   * Dnešok v pásme používateľa — podľa neho je udalosť prebehnutá. Povinný:
   * server beží v UTC a večer by inak dnešnú písomku ukázal ako včerajšiu.
   */
  todayIso: string;
  limit?: number;
}

/** `lower(translate(stĺpec, …))` — presne to, čo robí `fold()` v JavaScripte. */
function folded(column: AnyPgColumn): SQL {
  return sql`lower(translate(coalesce(${column}, ''), ${FOLD_FROM}, ${FOLD_TO}))`;
}

/**
 * Zhoda kdekoľvek v stĺpci, po zložení diakritiky na oboch stranách.
 *
 * `%` a `_` z dopytu sa hľadajú doslova (`likeContains`) — inak by „50%"
 * našlo všetko s „50".
 */
function matches(column: AnyPgColumn, needle: string): SQL {
  return sql`${folded(column)} like ${likeContains(needle)} escape '\\'`;
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
  { todayIso, limit = 40 }: SearchOptions,
): Promise<SearchHit[]> {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];

  const db = await getDb();
  const perKind = Math.max(5, Math.ceil(limit / 3));

  const [taskRows, ideaRows, projectRows, areaRows, journalRows, agendaRows] = await Promise.all([
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

    /*
      Udalosti aj s predmetom. Názov písomky predmet nenesie — „z fyziky" sa
      pri zachytení z názvu vystrihne do `subjectId` — takže bez spojenia by
      „fyzika" písomku z fyziky nenašla. Najnovšie prvé: pri dvadsiatich
      písomkách za rok je tá z minulého týždňa pravdepodobnejšia než tá
      spred roka.
    */
    db
      .select({
        id: agendaItems.id,
        kind: agendaItems.kind,
        title: agendaItems.title,
        note: agendaItems.note,
        place: agendaItems.place,
        gradeNote: agendaItems.gradeNote,
        date: agendaItems.date,
        endDate: agendaItems.endDate,
        cancelledAt: agendaItems.cancelledAt,
        deletedAt: agendaItems.deletedAt,
        subjectCode: schoolSubjects.code,
        subjectName: schoolSubjects.name,
      })
      .from(agendaItems)
      .leftJoin(schoolSubjects, eq(agendaItems.subjectId, schoolSubjects.id))
      .where(
        and(
          eq(agendaItems.userId, userId),
          or(
            matches(agendaItems.title, needle),
            matches(agendaItems.note, needle),
            matches(agendaItems.place, needle),
            matches(agendaItems.gradeNote, needle),
            matches(schoolSubjects.name, needle),
            matches(schoolSubjects.code, needle),
          ),
        ),
      )
      .orderBy(desc(agendaItems.date))
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
      meta: null,
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
      meta: null,
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
      meta: null,
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
      meta: null,
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
      meta: null,
      archived: false,
    });
  }

  for (const row of agendaRows) {
    const deadline = row.kind === "deadline";
    const deleted = row.deletedAt !== null;
    const cancelled = row.cancelledAt !== null;
    const past = isAgendaPast(row, todayIso);
    const subjectMatch =
      row.subjectName !== null &&
      (fold(row.subjectName).includes(needle) || fold(row.subjectCode ?? "").includes(needle));

    hits.push({
      kind: row.kind,
      id: row.id,
      title: row.title,
      snippet:
        snippetAround(row.note, needle) ??
        snippetAround(row.place, needle) ??
        snippetAround(row.gradeNote, needle) ??
        (subjectMatch ? row.subjectName : null),
      meta: [agendaDateSk(row, todayIso), row.subjectCode].filter(Boolean).join(" · "),
      /*
        Živá, prebehnutá aj zrušená udalosť sa otvorí v detaile. Zmazanú
        detail nenačíta — jej miesto je v archíve medzi zmazanými, kde sa dá
        vrátiť. Dopyt ide so sebou, aby výsledky ostali na obrazovke.
      */
      href: deleted
        ? `/archiv?q=${encodeURIComponent(query.trim())}&druh=zmazane`
        : `/udalosti?udalost=${encodeURIComponent(row.id)}`,
      archived: deleted || cancelled || past,
      date: row.date,
      // Rod podľa druhu, ktorý stojí hneď vedľa: „Udalosť · prebehla", „Deadline · uplynul".
      ...(deleted
        ? {}
        : cancelled
          ? { archivedLabel: deadline ? "zrušený" : "zrušená" }
          : past
            ? { archivedLabel: deadline ? "uplynul" : "prebehla" }
            : {}),
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
      const byTitle = a.title.localeCompare(b.title, "sk");
      if (byTitle !== 0 || a.date === undefined || b.date === undefined) return byTitle;
      // Rovnomenné udalosti: čo príde, od najbližšej; čo prešlo, od najnovšej.
      return a.archived ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    })
    .slice(0, limit);
}

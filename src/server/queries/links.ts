import "server-only";

import { and, asc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { areas, ideas, journal, links, projects, tasks } from "@/db/schema";
import { FOLD_FROM, FOLD_TO, fold } from "@/lib/fold";

/* ═══════════════════════════════════════════════════════════════════════════
   ODKAZY [[…]] — ČÍTACIA VRSTVA

   Tabuľka `links` je INDEX, nie pravda. Pravda je text, v ktorom je `[[…]]`
   napísané; z neho sa index vie kedykoľvek prepočítať (`syncLinks`), opačne
   to nejde. Preto sa tu nikde nespoliehame na to, že riadok v `links` má
   živý náprotivok — zdroj aj cieľ sa vždy dohľadávajú v skutočných tabuľkách
   a to, čo sa medzitým stratilo, sa jednoducho nezobrazí.

   Názvy sa porovnávajú cez `@/lib/fold` — „byt" nájde „Byt" aj „Byť". Kto
   píše poznámku, nemá riešiť dĺžne a mäkčene; od toho je hľadanie.
   ═══════════════════════════════════════════════════════════════════════════ */

type LinkRow = typeof links.$inferSelect;

/** Na čo odkaz ukazuje — tie isté hodnoty ako `entity_type` v schéme. */
export type LinkEntityType = LinkRow["fromType"];

export interface LinkTarget {
  kind: LinkEntityType;
  id: string;
  /** SKUTOČNÝ názov entity, nie to, čo je napísané v `[[…]]`. */
  name: string;
}

export interface Backlink {
  /** Odkiaľ sa odkazuje. */
  kind: LinkEntityType;
  id: string;
  /** Názov zdroja; pri denníku je to jeho dátum. */
  title: string;
}

/**
 * `lower(translate(stĺpec, …))` — presne to, čo robí `fold()` v JavaScripte.
 *
 * Tá istá dvojica ako v `@/server/queries/search.ts`. Zdroj písmen je jeden
 * (`@/lib/fold`), takže sa hľadanie a odkazy nemôžu rozísť; opakuje sa len
 * tento jeden riadok SQL, čo je lacnejšie než ťahať pomocníka cez modul,
 * ktorý o odkazoch nič nevie.
 */
function folded(column: AnyPgColumn): SQL {
  return sql`lower(translate(coalesce(${column}, ''), ${FOLD_FROM}, ${FOLD_TO}))`;
}

/**
 * Koľko rôznych názvov naraz má zmysel hľadať.
 *
 * Podmienka sa skladá ako `OR` cez názvy, takže poznámka s tisíckou odkazov
 * by vyrobila tisícčlenný dotaz. Sto rôznych cieľov v jednom texte je hranica,
 * za ktorou už nejde o odkazy, ale o zoznam.
 */
const MAX_LABELS = 100;

/**
 * Nájde entity podľa názvov. Kľúčom výslednej mapy je `fold(label)`.
 *
 * **Keď sa entita nenájde, v mape jednoducho nie je** — to nie je chyba, ale
 * bežný stav: odkaz na niečo, čo ešte nevzniklo, má v texte pokojne ležať
 * a ožiť v deň, keď entita s tým názvom vznikne.
 *
 * Pri zhode názvov naprieč druhmi rozhoduje pevné poradie **projekt → oblasť
 * → nápad → úloha**. Odkaz `[[Byt]]` mieri takmer vždy na miesto, kam sa veci
 * zbierajú, nie na jednu z päťdesiatich úloh, ktoré sa tak zhodou okolností
 * volajú. V rámci jedného druhu vyhráva staršia entita (`id` je UUID v7,
 * takže je to poradie vzniku) — hlavne aby bol výsledok predvídateľný.
 *
 * Denník sa nehľadá vôbec: nemá názov. Jeho jediným „názvom" je dátum a
 * `[[2026-08-16]]` by z odkazu spravilo hádanie formátu.
 */
export async function resolveLinkTargets(
  userId: string,
  labels: readonly string[],
): Promise<Map<string, LinkTarget>> {
  const found = new Map<string, LinkTarget>();

  const needles = [...new Set(labels.map(fold).filter((needle) => needle !== ""))].slice(
    0,
    MAX_LABELS,
  );
  if (needles.length === 0) return found;

  const db = await getDb();

  /** `OR` cez názvy. Pri prázdnom poli by `or()` vrátilo `undefined`. */
  const nameIn = (column: AnyPgColumn): SQL => {
    const conditions = needles.map((needle) => sql`${folded(column)} = ${needle}`);
    // `needles` je neprázdne (kontrola vyššie), takže `or` tu vždy niečo vráti.
    return or(...conditions) ?? sql`false`;
  };

  const [projectRows, areaRows, ideaRows, taskRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(eq(projects.userId, userId), isNull(projects.deletedAt), nameIn(projects.name)),
      )
      .orderBy(asc(projects.id)),

    db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(and(eq(areas.userId, userId), isNull(areas.deletedAt), nameIn(areas.name)))
      .orderBy(asc(areas.id)),

    db
      .select({ id: ideas.id, name: ideas.title })
      .from(ideas)
      .where(and(eq(ideas.userId, userId), isNull(ideas.deletedAt), nameIn(ideas.title)))
      .orderBy(asc(ideas.id)),

    db
      .select({ id: tasks.id, name: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), nameIn(tasks.title)))
      .orderBy(asc(tasks.id)),
  ]);

  /* Poradie volaní = poradie prednosti. Prvý zápis vyhráva. */
  const claim = (kind: LinkEntityType, rows: { id: string; name: string }[]): void => {
    for (const row of rows) {
      const key = fold(row.name);
      if (!found.has(key)) found.set(key, { kind, id: row.id, name: row.name });
    }
  };

  claim("project", projectRows);
  claim("area", areaRows);
  claim("idea", ideaRows);
  claim("task", taskRows);

  return found;
}

/**
 * Kto odkazuje sem — jediný dôvod, prečo tabuľka `links` vôbec existuje.
 *
 * Zdroje, ktoré medzitým zmizli alebo boli mäkko zmazané, sa preskočia bez
 * hlásenia: index môže byť starší než skutočnosť a spätný odkaz na neexistujúcu
 * úlohu je horší než žiadny. Poriadok v tabuľke spraví najbližší `syncLinks`.
 */
export async function getBacklinks(
  userId: string,
  toType: LinkEntityType,
  toId: string,
): Promise<Backlink[]> {
  const db = await getDb();

  const rows = await db
    .select({ fromType: links.fromType, fromId: links.fromId })
    .from(links)
    .where(and(eq(links.userId, userId), eq(links.toType, toType), eq(links.toId, toId)))
    .orderBy(asc(links.fromId));

  if (rows.length === 0) return [];

  const idsByKind = new Map<LinkEntityType, string[]>();
  for (const row of rows) {
    const list = idsByKind.get(row.fromType);
    if (list) list.push(row.fromId);
    else idsByKind.set(row.fromType, [row.fromId]);
  }

  /** `id → názov` pre jeden druh entity. Prázdna mapa, keď druh nie je v hre. */
  const titlesFor = async (kind: LinkEntityType): Promise<Map<string, string>> => {
    const ids = idsByKind.get(kind);
    const titles = new Map<string, string>();
    if (!ids || ids.length === 0) return titles;

    /*
      `OR` cez identifikátory namiesto `inArray`: spätných odkazov je z povahy
      veci pár desiatok a takto je podmienka rovnaká vo všetkých piatich vetvách.
    */
    const idIn = (column: AnyPgColumn): SQL =>
      or(...ids.map((id) => sql`${column} = ${id}`)) ?? sql`false`;

    if (kind === "task") {
      const found = await db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), idIn(tasks.id)));
      for (const row of found) titles.set(row.id, row.title);
      return titles;
    }

    if (kind === "idea") {
      const found = await db
        .select({ id: ideas.id, title: ideas.title })
        .from(ideas)
        .where(and(eq(ideas.userId, userId), isNull(ideas.deletedAt), idIn(ideas.id)));
      for (const row of found) titles.set(row.id, row.title);
      return titles;
    }

    if (kind === "project") {
      const found = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(
          and(eq(projects.userId, userId), isNull(projects.deletedAt), idIn(projects.id)),
        );
      for (const row of found) titles.set(row.id, row.name);
      return titles;
    }

    if (kind === "area") {
      const found = await db
        .select({ id: areas.id, name: areas.name })
        .from(areas)
        .where(and(eq(areas.userId, userId), isNull(areas.deletedAt), idIn(areas.id)));
      for (const row of found) titles.set(row.id, row.name);
      return titles;
    }

    // Denník názov nemá — jeho menovkou je dátum, rovnako ako vo výsledkoch hľadania.
    const found = await db
      .select({ id: journal.id, date: journal.date })
      .from(journal)
      .where(and(eq(journal.userId, userId), idIn(journal.id)));
    for (const row of found) titles.set(row.id, `Denník — ${row.date}`);
    return titles;
  };

  const [taskTitles, ideaTitles, projectTitles, areaTitles, journalTitles] =
    await Promise.all([
      titlesFor("task"),
      titlesFor("idea"),
      titlesFor("project"),
      titlesFor("area"),
      titlesFor("journal"),
    ]);

  const titlesByKind: Record<LinkEntityType, Map<string, string>> = {
    task: taskTitles,
    idea: ideaTitles,
    project: projectTitles,
    area: areaTitles,
    journal: journalTitles,
  };

  const backlinks: Backlink[] = [];
  for (const row of rows) {
    const title = titlesByKind[row.fromType].get(row.fromId);
    if (title === undefined) continue;
    backlinks.push({ kind: row.fromType, id: row.fromId, title });
  }

  // Abecedne — spätné odkazy sú zoznam na prečítanie, nie fronta na prácu.
  return backlinks.sort((a, b) => a.title.localeCompare(b.title, "sk"));
}

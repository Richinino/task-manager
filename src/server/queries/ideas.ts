import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  areas,
  ideas,
  projects,
  users,
  type Area,
  type Idea,
  type IdeaStage,
  type Project,
} from "@/db/schema";
import {
  compareIncubatorCandidates,
  daysSinceTouch,
  effectiveIdeaStage,
  touchThreshold,
} from "@/lib/ideas";
import { parseSettings } from "@/lib/settings";

/**
 * Čítacia vrstva nápadov.
 *
 * Nápad nie je úloha: úloha je záväzok, nápad je možnosť. Preto má vlastnú
 * tabuľku aj vlastný životný cyklus `raw → incubating → promoted | rejected`
 * a k tomu odvodené `faded`, ktoré sa NIKDY neukladá — dopočítava sa tu pri
 * čítaní z `lastTouchedAt` a nastavenia `fadeAfterDays`. Dôvod je v komentári
 * pri `effectiveIdeaStage` v `@/lib/ideas`.
 *
 * Každý dotaz filtruje `userId` aj `deletedAt IS NULL`, vrátane pripojených
 * oblastí a projektov.
 */

export interface IdeaWithRelations extends Idea {
  area: { id: string; name: string; color: string } | null;
  /** Projekt, na ktorý bol nápad povýšený. */
  promotedProject: { id: string; name: string } | null;
  /** Koľko dní sa nápadu nikto nedotkol. */
  staleDays: number;
  /**
   * Odvodená fáza. Ak je uložená `raw`/`incubating`, ale nápad je dlhšie
   * než `fadeAfterDays` nedotknutý, vráti sa `faded` — bez zápisu do databázy.
   */
  effectiveStage: "raw" | "incubating" | "promoted" | "rejected" | "faded";
}

export interface ListIdeasOptions {
  /**
   * Pribrať aj rozhodnuté nápady (`promoted`, `rejected`). Predvolene nie —
   * zoznam má ukazovať to, o čom sa ešte dá rozhodnúť.
   *
   * Vyblednuté nápady sem nepatria: `faded` je odvodený stav nad uloženým
   * `raw`/`incubating`, nápad teda ostáva v hre a v zozname má byť vidieť.
   */
  includeSettled?: boolean;
}

/** Fázy, v ktorých je nápad ešte otvorený. */
const OPEN_STAGES: IdeaStage[] = ["raw", "incubating"];
/** Fázy, o ktorých je rozhodnuté. */
const SETTLED_STAGES: IdeaStage[] = ["promoted", "rejected"];

/**
 * Strop kandidátov inkubátora načítaných do pamäte.
 *
 * Skóre inkubátora je jedna čistá funkcia v `@/lib/ideas` a nechceme ho mať
 * druhýkrát prepísané do SQL — dve verzie toho istého vzorca sa skôr či neskôr
 * rozídu. Preto sa kandidáti (už zúžení na otvorené a dostatočne staré nápady)
 * zoradia v pamäti. Strop je poistka pre prípad, že by ich niekto nazbieral
 * tisíce; berú sa najdlhšie nedotknuté, teda tí s najsilnejším nárokom.
 */
const INCUBATOR_CANDIDATE_CAP = 300;

/** Koľko nápadov inkubátor ponúkne, keď sa nepovie inak. */
const INCUBATOR_DEFAULT_LIMIT = 3;

/**
 * Prahy zhnitia a inkubátora z nastavení používateľa.
 *
 * Číta sa priamo pre zadané `userId`, nie cez `requireUser()`: podpis týchto
 * funkcií berie `userId` ako parameter, takže brať nastavenia zo session by
 * znamenalo, že by sa dali dopočítať cudzie nápady podľa vlastných prahov.
 * Je to jeden krátky dotaz na volanie, nie dotaz na riadok.
 */
async function ideaSettings(
  userId: string,
): Promise<{ fadeAfterDays: number; incubatorAfterDays: number }> {
  const db = await getDb();
  const rows = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const settings = parseSettings(rows[0]?.settings);
  return {
    fadeAfterDays: settings.fadeAfterDays,
    incubatorAfterDays: settings.incubatorAfterDays,
  };
}

interface IdeaRow {
  idea: Idea;
  area: Area | null;
  project: Project | null;
}

/**
 * Jadro všetkých zoznamov: jeden dotaz — nápad + oblasť + povýšený projekt.
 *
 * Podmienky `deletedAt IS NULL` sú aj v samotných JOIN-och. Mazanie oblasti
 * z M3 odpája úlohy a projekty, ale o nápadoch ešte nevedelo, takže
 * `ideas.area_id` môže ukazovať na mäkko zmazanú oblasť — bez tejto poistky
 * by sa v zozname zjavila oblasť, ktorú používateľ nikde inde nevidí.
 */
async function selectIdeaRows(
  userId: string,
  extra: SQL | undefined,
  order: SQL[],
  limit?: number,
): Promise<IdeaRow[]> {
  const db = await getDb();

  const query = db
    .select({ idea: ideas, area: areas, project: projects })
    .from(ideas)
    .leftJoin(
      areas,
      and(eq(areas.id, ideas.areaId), eq(areas.userId, userId), isNull(areas.deletedAt)),
    )
    .leftJoin(
      projects,
      and(
        eq(projects.id, ideas.promotedProjectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .where(and(eq(ideas.userId, userId), isNull(ideas.deletedAt), extra))
    .orderBy(...order);

  return limit === undefined ? query : query.limit(limit);
}

function toIdeaWithRelations(
  row: IdeaRow,
  fadeAfterDays: number,
  now: Date,
): IdeaWithRelations {
  const staleDays = daysSinceTouch(row.idea.lastTouchedAt, now);
  return {
    ...row.idea,
    area: row.area
      ? { id: row.area.id, name: row.area.name, color: row.area.color }
      : null,
    promotedProject: row.project
      ? { id: row.project.id, name: row.project.name }
      : null,
    staleDays,
    effectiveStage: effectiveIdeaStage(row.idea.stage, staleDays, fadeAfterDays),
  };
}

/**
 * Poradie zoznamu: rozhodnuté padajú na koniec, potom najsilnejšia iskra
 * a nakoniec naposledy dotknuté hore — čerstvo doplnený nápad má byť vidieť.
 */
function ideaOrder(): SQL[] {
  return [
    sql`case when ${ideas.stage} in ('promoted', 'rejected') then 1 else 0 end`,
    desc(ideas.spark),
    desc(ideas.lastTouchedAt),
  ];
}

export async function listIdeas(
  userId: string,
  options: ListIdeasOptions = {},
): Promise<IdeaWithRelations[]> {
  const { fadeAfterDays } = await ideaSettings(userId);
  const rows = await selectIdeaRows(
    userId,
    options.includeSettled === true ? undefined : notInArray(ideas.stage, SETTLED_STAGES),
    ideaOrder(),
  );

  const now = new Date();
  return rows.map((row) => toIdeaWithRelations(row, fadeAfterDays, now));
}

/**
 * Detail nápadu. Rozhodnuté ani vyblednuté sa nefiltrujú — na detail vedie
 * odkaz aj z povýšeného projektu a nesmie skončiť ako „nenašlo sa".
 */
export async function getIdea(
  userId: string,
  id: string,
): Promise<IdeaWithRelations | null> {
  const { fadeAfterDays } = await ideaSettings(userId);
  const rows = await selectIdeaRows(userId, eq(ideas.id, id), ideaOrder(), 1);

  const row = rows[0];
  return row ? toIdeaWithRelations(row, fadeAfterDays, new Date()) : null;
}

/**
 * Nápady do inkubátora — najdlhšie nedotknuté, vážené iskrou.
 *
 * Do výberu sa dostane nápad, ktorý je otvorený (`raw`/`incubating`), nikto
 * sa ho nedotkol aspoň `incubatorAfterDays` dní a zároveň ešte nevybledol.
 * Vyblednutý nápad sem nepatrí: inkubátor má pripomínať to, čo ešte žije,
 * nie donekonečna vyťahovať mŕtvoly.
 *
 * Poradie určuje `incubatorScore` — vzorec aj jeho zdôvodnenie sú
 * v `@/lib/ideas`.
 */
export async function getIncubatorIdeas(
  userId: string,
  limit: number = INCUBATOR_DEFAULT_LIMIT,
): Promise<IdeaWithRelations[]> {
  const { fadeAfterDays, incubatorAfterDays } = await ideaSettings(userId);

  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.floor(limit), INCUBATOR_CANDIDATE_CAP)
      : INCUBATOR_DEFAULT_LIMIT;

  const now = new Date();
  /*
    Hranice sa počítajú ako okamihy a porovnávajú priamo v SQL, aby sa dni
    nemuseli rátať nad každým riadkom. `touchThreshold` je presný náprotivok
    `daysSinceTouch`, takže obe cesty vedú k tomu istému číslu.
  */
  const ripeBefore = touchThreshold(incubatorAfterDays, now);
  const fadedBefore = touchThreshold(fadeAfterDays, now);

  const rows = await selectIdeaRows(
    userId,
    and(
      inArray(ideas.stage, OPEN_STAGES),
      // dozreté na inkubátor: nedotknuté aspoň `incubatorAfterDays` dní
      lte(ideas.lastTouchedAt, ripeBefore),
      // ale ešte nie vyblednuté
      gt(ideas.lastTouchedAt, fadedBefore),
    ),
    [asc(ideas.lastTouchedAt)],
    INCUBATOR_CANDIDATE_CAP,
  );

  return rows
    .map((row) => toIdeaWithRelations(row, fadeAfterDays, now))
    .sort(compareIncubatorCandidates)
    .slice(0, safeLimit);
}

/**
 * Čísla nad zoznamom nápadov. Jeden dotaz s podmienenými agregáciami.
 *
 * `faded` sa počíta z tej istej hranice ako `effectiveStage`, takže sa číslo
 * nikdy nerozíde so zoznamom: vyblednutý nápad sa do `raw` ani `incubating`
 * už neráta, hoci má tú hodnotu uloženú.
 */
export async function getIdeaCounts(
  userId: string,
): Promise<{ raw: number; incubating: number; faded: number }> {
  const db = await getDb();
  const { fadeAfterDays } = await ideaSettings(userId);
  const fadedBefore = touchThreshold(fadeAfterDays).toISOString();

  const rows = await db
    .select({
      raw: sql<number>`cast(count(*) filter (
        where ${ideas.stage} = 'raw'
          and ${ideas.lastTouchedAt} > ${fadedBefore}::timestamptz
      ) as int)`,
      incubating: sql<number>`cast(count(*) filter (
        where ${ideas.stage} = 'incubating'
          and ${ideas.lastTouchedAt} > ${fadedBefore}::timestamptz
      ) as int)`,
      faded: sql<number>`cast(count(*) filter (
        where ${ideas.stage} in ('raw', 'incubating')
          and ${ideas.lastTouchedAt} <= ${fadedBefore}::timestamptz
      ) as int)`,
    })
    .from(ideas)
    .where(and(eq(ideas.userId, userId), isNull(ideas.deletedAt)));

  const row = rows[0];
  return {
    raw: Number(row?.raw ?? 0),
    incubating: Number(row?.incubating ?? 0),
    faded: Number(row?.faded ?? 0),
  };
}

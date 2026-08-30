import "server-only";

import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  learningPillars,
  skillMilestones,
  skills,
  tasks,
  type LearningPillar,
  type Skill,
  type SkillMilestone,
} from "@/db/schema";
import {
  daysSinceLastLesson,
  isInWindow,
  isSkillQuiet,
  lessonDate,
  lessonsInWindow,
  medianDaysBetweenMilestones,
  pillarBreakdown,
  skillRank,
  type Lekcia,
  type RankLabel,
} from "@/lib/learning";
import { toIsoDate } from "@/lib/dates";

/* ═══════════════════════════════════════════════════════════════════════════
   UČENIE — ČÍTANIE

   Lekcia nemá vlastnú tabuľku. Je to **dokončená úloha, ktorá má pilier**,
   takže sa tu nečíta zo zoznamu lekcií, ale z `tasks`. Vďaka tomu sa čísla
   nemôžu rozísť so skutočnosťou: keď úlohu od-dokončíš alebo zmažeš, lekcia
   zmizne sama a niet čo dosynchronizovať.

   Preto tiež každý dotaz filtruje `status = "done"` **aj** `completedAt`.
   Samotný stav by nestačil — bez okamihu dokončenia by lekcia nemala deň,
   a deň je to jediné, na čom celá analýza stojí.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SkillCard extends Skill {
  milestones: SkillMilestone[];
  /** Koľko míľnikov je dosiahnutých. */
  reached: number;
  rank: RankLabel;
  /** Lekcie v kĺzavom okne. */
  lessons: number;
  /** Lekcie celkovo, od začiatku. */
  lessonsTotal: number;
  minutes: number;
  daysSince: number | null;
  quiet: boolean;
  /** Medián dní medzi míľnikmi; `null`, kým nie sú aspoň dva. */
  tempoDays: number | null;
}

export interface PillarCard extends LearningPillar {
  skills: SkillCard[];
  lessons: number;
  minutes: number;
  /** Koľko lekcií v okne nemalo odhad — súčet minút je o ne neúplný. */
  withoutEstimate: number;
  /** Lekcie v okne, ktoré ešte nemajú zručnosť. Nad `PYTAJ_SA_PO` sa appka opýta. */
  looseLessons: number;
}

export interface LearningOverview {
  pillars: PillarCard[];
  lessons: number;
  minutes: number;
  /** Dni od poslednej lekcie naprieč všetkými piliermi. */
  daysSince: number | null;
}

export interface LessonRow {
  taskId: string;
  title: string;
  date: string;
  pillarId: string;
  skillId: string | null;
  minutes: number | null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEKCIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Všetky lekcie používateľa, od najnovšej.
 *
 * Zámerne **bez časového stropu**. Ponuka „len posledný rok" by bola lacnejšia,
 * ale zručnosť, ktorá je ticho pätnásť mesiacov, by sa tvárila, že nemala
 * lekciu nikdy — a to je presne opačná informácia, než aká je pravda. Pri
 * osobnej appke ide o stovky riadkov s tromi stĺpcami, takže úspora by nebola
 * ani citeľná.
 */
export async function listLessons(
  userId: string,
  timeZone: string,
): Promise<LessonRow[]> {
  const db = await getDb();

  const rows = await db
    .select({
      taskId: tasks.id,
      title: tasks.title,
      completedAt: tasks.completedAt,
      pillarId: tasks.lessonPillarId,
      skillId: tasks.lessonSkillId,
      minutes: tasks.estimateMin,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "done"),
        isNotNull(tasks.completedAt),
        isNotNull(tasks.lessonPillarId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(desc(tasks.completedAt));

  return rows.flatMap((row) => {
    /* Podmienky vyššie to už zaručujú; TypeScript o tom ale nevie. */
    if (row.completedAt === null || row.pillarId === null) return [];
    return [
      {
        taskId: row.taskId,
        title: row.title,
        date: lessonDate(row.completedAt, timeZone),
        pillarId: row.pillarId,
        skillId: row.skillId,
        minutes: row.minutes,
      },
    ];
  });
}

/** Tvar, s ktorým počíta čistá logika v `@/lib/learning`. */
function toLekcie(rows: readonly LessonRow[]): Lekcia[] {
  return rows.map((row) => ({
    date: row.date,
    pillarId: row.pillarId,
    skillId: row.skillId,
    minutes: row.minutes,
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREHĽAD
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LearningOptions {
  /** Pribrať aj archivované piliere a zručnosti. Predvolene nie. */
  includeArchived?: boolean;
  /** Dnešok v pásme používateľa. Predvolene sa odvodí zo servera. */
  todayIso?: string;
}

/**
 * Celá sekcia učenia jedným dychom: piliere, ich zručnosti a čísla za nimi.
 *
 * Načíta sa to štyrmi dotazmi bez ohľadu na počet pilierov — nie desiatimi.
 * Skladá sa to potom v pamäti, lebo na Verceli sa každá cesta do databázy
 * pripočíta k čakaniu, ktoré človek vidí.
 */
export async function getLearningOverview(
  userId: string,
  timeZone: string,
  options: LearningOptions = {},
): Promise<LearningOverview> {
  const db = await getDb();
  const todayIso = options.todayIso ?? toIsoDate(new Date());
  const zivy = options.includeArchived !== true;

  const pillarRows = await db
    .select()
    .from(learningPillars)
    .where(
      and(
        eq(learningPillars.userId, userId),
        isNull(learningPillars.deletedAt),
        zivy ? isNull(learningPillars.archivedAt) : undefined,
      ),
    )
    .orderBy(asc(learningPillars.sort), asc(learningPillars.createdAt));

  if (pillarRows.length === 0) {
    return { pillars: [], lessons: 0, minutes: 0, daysSince: null };
  }

  const skillRows = await db
    .select()
    .from(skills)
    .where(
      and(
        eq(skills.userId, userId),
        isNull(skills.deletedAt),
        zivy ? isNull(skills.archivedAt) : undefined,
      ),
    )
    .orderBy(asc(skills.sort), asc(skills.createdAt));

  const milestoneRows =
    skillRows.length === 0
      ? []
      : await db
          .select()
          .from(skillMilestones)
          .where(eq(skillMilestones.userId, userId))
          .orderBy(asc(skillMilestones.sort), asc(skillMilestones.createdAt));

  const lessonRows = await listLessons(userId, timeZone);
  const lekcie = toLekcie(lessonRows);

  const milestonesBySkill = new Map<string, SkillMilestone[]>();
  for (const milestone of milestoneRows) {
    const list = milestonesBySkill.get(milestone.skillId) ?? [];
    list.push(milestone);
    milestonesBySkill.set(milestone.skillId, list);
  }

  const skillsByPillar = new Map<string, Skill[]>();
  for (const skill of skillRows) {
    const list = skillsByPillar.get(skill.pillarId) ?? [];
    list.push(skill);
    skillsByPillar.set(skill.pillarId, list);
  }

  const breakdown = pillarBreakdown(
    lekcie.filter((l) => isInWindow(l.date, todayIso)),
    pillarRows.map((p) => p.id),
  );
  const byPillar = new Map(breakdown.map((row) => [row.pillarId, row]));

  const pillars: PillarCard[] = pillarRows.map((pillar) => {
    const suhrn = byPillar.get(pillar.id);
    const vlastne = lekcie.filter((l) => l.pillarId === pillar.id);

    const cards: SkillCard[] = (skillsByPillar.get(pillar.id) ?? []).map((skill) => {
      const milestones = milestonesBySkill.get(skill.id) ?? [];
      const dosiahnute = milestones.filter((m) => m.reachedAt !== null);
      const skillLessons = vlastne.filter((l) => l.skillId === skill.id);

      return {
        ...skill,
        milestones,
        reached: dosiahnute.length,
        rank: skillRank(dosiahnute.length, milestones.length),
        lessons: lessonsInWindow(skillLessons, todayIso),
        lessonsTotal: skillLessons.length,
        minutes: skillLessons
          .filter((l) => isInWindow(l.date, todayIso))
          .reduce((sum, l) => sum + (l.minutes ?? 0), 0),
        daysSince: daysSinceLastLesson(skillLessons, todayIso),
        quiet: isSkillQuiet(skillLessons, todayIso),
        tempoDays: medianDaysBetweenMilestones(
          dosiahnute.map((m) => lessonDate(m.reachedAt!, timeZone)),
        ),
      };
    });

    return {
      ...pillar,
      skills: cards,
      lessons: suhrn?.lessons ?? 0,
      minutes: suhrn?.minutes ?? 0,
      withoutEstimate: suhrn?.withoutEstimate ?? 0,
      looseLessons: lessonsInWindow(
        vlastne.filter((l) => l.skillId === null),
        todayIso,
      ),
    };
  });

  return {
    pillars,
    lessons: pillars.reduce((sum, p) => sum + p.lessons, 0),
    minutes: pillars.reduce((sum, p) => sum + p.minutes, 0),
    daysSince: daysSinceLastLesson(lekcie, todayIso),
  };
}

/**
 * Jedna zručnosť aj s míľnikmi a jej lekciami.
 *
 * Ide cez `getLearningOverview` a vyberá si z výsledku — vedome. Druhá kópia
 * skladania čísel by sa časom rozišla s tou prvou a na obrazovke by potom
 * pilier tvrdil niečo iné než zručnosť v ňom.
 */
export async function getSkill(
  userId: string,
  id: string,
  timeZone: string,
  options: LearningOptions = {},
): Promise<{ skill: SkillCard; pillar: LearningPillar; lessons: LessonRow[] } | null> {
  const prehlad = await getLearningOverview(userId, timeZone, {
    ...options,
    includeArchived: true,
  });

  for (const pillar of prehlad.pillars) {
    const skill = pillar.skills.find((s) => s.id === id);
    if (skill === undefined) continue;

    const lessons = (await listLessons(userId, timeZone)).filter(
      (l) => l.skillId === id,
    );
    return { skill, pillar, lessons };
  }

  return null;
}

/** Piliere na výber v úlohe — bez čísel, len zoznam. */
export async function listPillars(userId: string): Promise<LearningPillar[]> {
  const db = await getDb();
  return db
    .select()
    .from(learningPillars)
    .where(
      and(
        eq(learningPillars.userId, userId),
        isNull(learningPillars.deletedAt),
        isNull(learningPillars.archivedAt),
      ),
    )
    .orderBy(asc(learningPillars.sort), asc(learningPillars.createdAt));
}

/** Zručnosti na výber v úlohe, spolu s pilierom, do ktorého patria. */
export async function listSkills(userId: string): Promise<Skill[]> {
  const db = await getDb();
  return db
    .select()
    .from(skills)
    .where(
      and(eq(skills.userId, userId), isNull(skills.deletedAt), isNull(skills.archivedAt)),
    )
    .orderBy(asc(skills.sort), asc(skills.createdAt));
}

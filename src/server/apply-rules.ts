import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  areas,
  habits,
  learningPillars,
  projects,
  schoolSubjects,
  skills,
} from "@/db/schema";
import { fold } from "@/lib/fold";
import type { AutoTagRule } from "@/lib/rules";

/**
 * Preklad pravidiel na hodnoty, ktoré sa dajú zapísať do úlohy.
 *
 * Pravidlá držia **mená** (`oblast:Zdravie`), nie identifikátory — text si
 * píše človek a musí v ňom vidieť, čo tam stojí. Preklad na identifikátory
 * patrí sem, na server, kde je databáza.
 *
 * ## Čo sa stane s menom, ktoré neexistuje
 *
 * Ticho sa preskočí. Oblasť sa dá premenovať aj zmazať a pravidlo o tom
 * nevie — ale zvyšok pravidla (štítky, priorita, odhad) je stále v poriadku
 * a zahodiť ho celé kvôli jednému menu by bolo horšie. Nefunkčné meno je
 * navyše vidieť priamo v texte pravidiel.
 *
 * ## Čo pravidlo NEPREPÍŠE
 *
 * Nič, čo si človek napísal sám. Keď je v texte `!1`, pravidlo s `!3`
 * prehrá — inak by sa nedalo raz za čas spraviť výnimka a človek by musel
 * pravidlo prepisovať kvôli jednej úlohe.
 */

/** Hodnoty, ktoré pravidlá pridávajú k úlohe. Všetko voliteľné. */
export interface RulePatch {
  priority?: 1 | 2 | 3;
  energy?: "low" | "mid" | "high";
  estimateMin?: number;
  projectId?: string;
  areaId?: string;
  subjectId?: string;
  schoolKind?: "homework" | "exam";
  lessonPillarId?: string;
  lessonSkillId?: string;
  habitId?: string;
  horizon?: "day" | "week" | "month" | "someday";
  isFrog?: boolean;
  staysOnDay?: boolean;
}

/** Sedí pravidlo na text? Tá istá úvaha ako v `suggestAutoTags`. */
function sedi(rule: AutoTagRule, foldedText: string): boolean {
  const needle = fold(rule.match.trim());
  return needle !== "" && foldedText.includes(needle);
}

/**
 * Nájde záznam podľa mena, bez ohľadu na diakritiku a veľkosť písmen.
 *
 * Porovnáva sa v pamäti, nie v SQL: zoznamov je pár desiatok, ale `lower()`
 * s odstránenou diakritikou by v Postgrese vyžadoval rozšírenie alebo
 * vlastný index. Za tú cenu to nestojí.
 */
function najdiPodlaMena<T extends { id: string }>(
  zoznam: readonly T[],
  meno: string | undefined,
  klucе: (zaznam: T) => readonly (string | null)[],
): string | undefined {
  if (meno === undefined) return undefined;
  const hladane = fold(meno.trim().toLowerCase());
  if (hladane === "") return undefined;

  const najdeny = zoznam.find((zaznam) =>
    klucе(zaznam).some((k) => k !== null && fold(k.toLowerCase()) === hladane),
  );
  return najdeny?.id;
}

/**
 * Prejde pravidlá a zloží z nich hodnoty pre úlohu.
 *
 * Poradie pravidiel rozhoduje: **prvá zhoda vyhráva**, ďalšie už nastavené
 * pole neprepíšu. Je to tá istá úvaha ako pri kontexte v `suggestAutoTags` —
 * dve pravidlá na tú istú vec sú spor a riešiť ho má poradie v zozname, nie
 * náhoda.
 */
export async function applyRules(
  userId: string,
  title: string,
  rules: readonly AutoTagRule[],
): Promise<RulePatch> {
  const text = fold(title.trim());
  if (text === "" || rules.length === 0) return {};

  const sediace = rules.filter((r) => sedi(r, text));
  if (sediace.length === 0) return {};

  /* Ťahá sa len to, na čo sa pravidlá naozaj pýtajú. */
  const treba = (pole: keyof AutoTagRule): boolean =>
    sediace.some((r) => r[pole] !== undefined);

  const db = await getDb();
  const [oblasti, projekty, predmety, piliere, zrucnosti, navyky] = await Promise.all([
    treba("areaName")
      ? db
          .select({ id: areas.id, name: areas.name })
          .from(areas)
          .where(eq(areas.userId, userId))
      : Promise.resolve([]),
    treba("projectName")
      ? db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(eq(projects.userId, userId))
      : Promise.resolve([]),
    treba("subjectName")
      ? db
          .select({
            id: schoolSubjects.id,
            code: schoolSubjects.code,
            name: schoolSubjects.name,
          })
          .from(schoolSubjects)
          .where(eq(schoolSubjects.userId, userId))
      : Promise.resolve([]),
    treba("pillarName")
      ? db
          .select({ id: learningPillars.id, name: learningPillars.name })
          .from(learningPillars)
          .where(eq(learningPillars.userId, userId))
      : Promise.resolve([]),
    treba("skillName")
      ? db
          .select({ id: skills.id, name: skills.name, pillarId: skills.pillarId })
          .from(skills)
          .where(eq(skills.userId, userId))
      : Promise.resolve([]),
    treba("habitName")
      ? db
          .select({ id: habits.id, title: habits.title })
          .from(habits)
          .where(and(eq(habits.userId, userId)))
      : Promise.resolve([]),
  ]);

  const patch: RulePatch = {};
  const nastav = <K extends keyof RulePatch>(kluc: K, hodnota: RulePatch[K]): void => {
    if (hodnota === undefined || patch[kluc] !== undefined) return;
    patch[kluc] = hodnota;
  };

  for (const rule of sediace) {
    nastav("priority", rule.priority);
    nastav("energy", rule.energy);
    nastav("estimateMin", rule.estimateMin);
    nastav("schoolKind", rule.schoolKind);
    nastav("horizon", rule.horizon);
    if (rule.isFrog === true) nastav("isFrog", true);
    if (rule.staysOnDay === true) nastav("staysOnDay", true);

    nastav("areaId", najdiPodlaMena(oblasti, rule.areaName, (a) => [a.name]));
    nastav("projectId", najdiPodlaMena(projekty, rule.projectName, (p) => [p.name]));
    /* Predmet sa dá napísať skratkou aj celým názvom — obe sú v texte bežné. */
    nastav(
      "subjectId",
      najdiPodlaMena(predmety, rule.subjectName, (p) => [p.code, p.name]),
    );
    nastav("lessonPillarId", najdiPodlaMena(piliere, rule.pillarName, (p) => [p.name]));
    nastav("lessonSkillId", najdiPodlaMena(zrucnosti, rule.skillName, (z) => [z.name]));
    nastav("habitId", najdiPodlaMena(navyky, rule.habitName, (n) => [n.title]));
  }

  /*
    Zručnosť bez piliera by úlohu označila za lekciu, ktorá nikam nepatrí.
    Keď pilier z pravidla nevyšiel, doplní sa ten, pod ktorý zručnosť patrí.
  */
  if (patch.lessonSkillId !== undefined && patch.lessonPillarId === undefined) {
    const zrucnost = zrucnosti.find((z) => z.id === patch.lessonSkillId);
    if (zrucnost !== undefined) patch.lessonPillarId = zrucnost.pillarId;
  }

  /* Bez predmetu je „domáca úloha vs písomka" rozlíšenie o ničom. */
  if (patch.subjectId === undefined) delete patch.schoolKind;

  return patch;
}

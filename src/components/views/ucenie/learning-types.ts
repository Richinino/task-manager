/**
 * Tvary, ktoré obrazovka učenia posiela do klienta.
 *
 * Zámerne to nie sú typy z `@/server/queries/learning`. Ten modul má na
 * začiatku `server-only` a klientsky komponent by na ňom visel aj vtedy, keď
 * z neho berie „len typ" — stačí jedna nepozorná úprava `import type` na
 * `import` a build spadne až za behu. Rovnaký dôvod má `habit-types.ts`.
 *
 * Druhý dôvod je vecný: karta nepotrebuje `createdAt` ani `deletedAt`. To, čo
 * ide cez hranicu servera, má byť presne to, čo sa kreslí.
 */

/** Hodnosť zručnosti — odvodená z míľnikov, nedá sa o ňu prísť. */
export type RankLabel = "začiatok" | "základy" | "v strede" | "takmer" | "vie to";

export interface MilestoneItem {
  id: string;
  title: string;
  /** `null`, kým míľnik nie je dosiahnutý. */
  reachedAt: string | null;
  /** Veta „ako to vieš". */
  evidence: string | null;
}

export interface SkillItem {
  id: string;
  name: string;
  note: string | null;
  archived: boolean;
  rank: RankLabel;
  reached: number;
  milestones: MilestoneItem[];
  /** Lekcie v kĺzavom okne. */
  lessons: number;
  lessonsTotal: number;
  minutes: number;
  daysSince: number | null;
  quiet: boolean;
  /** Medián dní medzi míľnikmi; `null`, kým nie sú aspoň dva. */
  tempoDays: number | null;
}

export interface PillarItem {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  lessons: number;
  minutes: number;
  withoutEstimate: number;
  /** Lekcie bez zručnosti. Nad hranicou sa appka opýta, či z toho spraviť zručnosť. */
  looseLessons: number;
  skills: SkillItem[];
}

import { addDays } from "./dates";
import { agendaTypeAccusative, agendaTypeInstrumental, shortDaySk } from "./agenda";

/**
 * Príprava na písomku a skúšanie — čistá logika.
 *
 * Príprava sú obyčajné úlohy s predmetom, druhom a väzbou na udalosť. Appka
 * ich len **ponúkne**: dni vyberie, človek odškrtne, čo nechce, a až potom
 * vzniknú. Rozhodnutia sú v `docs/UDALOSTI.md` (časť Príprava).
 */

export type PrepKind = "study" | "review";

interface PlanStep {
  /** Koľko dní pred udalosťou. */
  offset: number;
  kind: PrepKind;
  estimateMin: number;
}

/**
 * Plán podľa druhu. Písomka: dve sedenia učenia a krátke zopakovanie deň
 * pred. Skúšanie je užšie (jedna otázka, nie celá kapitola na papier), preto
 * jedno učenie a jedno zopakovanie, kratšie.
 */
export const PREP_PLAN: Record<"exam" | "oral", readonly PlanStep[]> = {
  exam: [
    { offset: -4, kind: "study", estimateMin: 45 },
    { offset: -2, kind: "study", estimateMin: 45 },
    { offset: -1, kind: "review", estimateMin: 20 },
  ],
  oral: [
    { offset: -2, kind: "study", estimateMin: 30 },
    { offset: -1, kind: "review", estimateMin: 20 },
  ],
};

/** Hranica, od ktorej je deň na prípravu príliš plný. */
export const HEAVY_DAY_LESSONS = 7;

/** Čo sa o dni vie — dodá server z rozvrhu a udalostí. */
export interface PrepDayInfo {
  /** Neodpadnuté hodiny mimo voľna. */
  lessons: number;
  /** Iná písomka či skúšanie v ten deň — krátky názov („písomka FYZ"). */
  clash: string | null;
  /** Udalosť, ktorá deň celý zaberá (výlet, sústredenie). */
  blockedBy: string | null;
}

export interface PrepSlot {
  date: string;
  kind: PrepKind;
  estimateMin: number;
  /** Prečo nie pôvodný deň — „v št 1. 10. je písomka FYZ". `null`, keď sedí plán. */
  why: string | null;
}

/** Prečo sa deň na prípravu nehodí, alebo `null`. */
function dayProblem(iso: string, info: PrepDayInfo): string | null {
  if (info.blockedBy !== null) return `${shortDaySk(iso)} je ${info.blockedBy}`;
  if (info.clash !== null) return `v ${shortDaySk(iso)} je ${info.clash}`;
  if (info.lessons >= HEAVY_DAY_LESSONS) {
    return `${shortDaySk(iso)} má ${info.lessons} hodín`;
  }
  return null;
}

/**
 * Návrh dní prípravy.
 *
 * Každý krok plánu má svoj deň (napr. 4 dni pred písomkou). Keď sa ten deň
 * nehodí — je v ňom iná písomka, sedem hodín alebo ho zaberá výlet — skúsi
 * sa deň pred ním, deň po ňom a ešte o deň skôr. Keď nesedí nič, ostane
 * pôvodný (lepšie učiť sa v plný deň než vôbec), len nikdy nie v minulosti
 * ani v deň písomky.
 *
 * Dni sa vyberajú **odzadu** — od zopakovania deň pred písomkou. To je krok,
 * ktorý má najmenej náhradných dní, a keby sa vyberal posledný, učenie pred
 * ním by mu deň mohlo zobrať. Každý ďalší krok musí padnúť pred ten, ktorý
 * je po ňom, takže učenie nikdy nepríde až po zopakovaní a dva kroky nikdy
 * nepadnú na jeden deň.
 *
 * Keď je písomka zajtra, zmestí sa len zopakovanie dnes; keď je dnes, nič.
 */
export function planPrep(input: {
  type: "exam" | "oral";
  date: string;
  todayIso: string;
  day: (iso: string) => PrepDayInfo;
}): PrepSlot[] {
  const { date, todayIso } = input;
  const out: PrepSlot[] = [];
  /** Výlučná horná hranica — deň nasledujúceho kroku (na začiatku písomka). */
  let limit = date;

  for (const step of [...PREP_PLAN[input.type]].reverse()) {
    const base = addDays(date, step.offset);
    const fits = (iso: string): boolean => iso >= todayIso && iso < limit;
    const baseProblem = fits(base) ? dayProblem(base, input.day(base)) : null;

    let pick: string | null = null;
    for (const candidate of [base, addDays(base, -1), addDays(base, 1), addDays(base, -2)]) {
      if (!fits(candidate)) continue;
      if (dayProblem(candidate, input.day(candidate)) !== null) continue;
      pick = candidate;
      break;
    }

    if (pick === null) {
      let fallback = base < todayIso ? todayIso : base;
      if (fallback >= limit) fallback = addDays(limit, -1);
      if (!fits(fallback)) continue;
      pick = fallback;
    }

    out.push({
      date: pick,
      kind: step.kind,
      estimateMin: step.estimateMin,
      why: pick !== base && baseProblem !== null ? baseProblem : null,
    });
    limit = pick;
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Názov úlohy prípravy: „Učiť sa na písomku", „Zopakovať pred skúšaním".
 *
 * Keď má písomka vlastnú tému („Písomka — funkcie"), pripojí sa k názvu —
 * inak by dve písomky z matiky v jednom týždni mali rovnaké úlohy a nedalo
 * by sa povedať, ktorá patrí ku ktorej. Predmet netreba: úloha ho nesie
 * a riadok ho kreslí.
 */
export function prepTitle(kind: PrepKind, type: "exam" | "oral", itemTitle: string): string {
  const base =
    kind === "study"
      ? `Učiť sa na ${agendaTypeAccusative(type)}`
      : `Zopakovať pred ${agendaTypeInstrumental(type)}`;
  const dash = itemTitle.indexOf(" — ");
  const topic = dash === -1 ? "" : itemTitle.slice(dash + 3).trim();
  return topic === "" ? base : `${base} — ${topic}`;
}

/**
 * Nový deň úlohy pod udalosťou, keď sa udalosť posunula o `delta` dní.
 *
 * Posunie sa o rovnaký počet dní, ale nikdy do minulosti a nikdy za
 * `latest` — pri písomke je to deň pred ňou (príprava po písomke nemá
 * zmysel), pri deadline jeho deň (odovzdať sa dá aj v ten deň). Keď už
 * pred udalosťou nie je žiadny deň (písomka je dnes), ostane dnešok.
 */
export function shiftPrepDate(
  planned: string,
  delta: number,
  todayIso: string,
  latest: string,
): string {
  let next = addDays(planned, delta);
  if (next > latest) next = latest;
  if (next < todayIso) next = todayIso;
  return next;
}

export const PREP_KIND_LABELS: Record<PrepKind, string> = {
  study: "učiť sa",
  review: "zopakovať",
};

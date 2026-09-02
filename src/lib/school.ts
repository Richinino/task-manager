import { diffDays, timeToMinutes } from "./dates";

/**
 * Čísla a stavy školského rozvrhu.
 *
 * Všetko sú čisté funkcie nad tým, čo už v databáze je. **Hotová hodina sa
 * nikde neukladá** — odvodí sa z toho, či jej koniec už prešiel.
 *
 * Je to tá istá myšlienka ako pri lekcii (dokončená úloha s pilierom, žiadna
 * tabuľka lekcií) a pri splnenom dni návyku (zlúčenie dvoch zdrojov). Dôvod
 * je vždy rovnaký: **čo sa nikam nekopíruje, to sa nemá ako rozísť.** Keď si
 * v piatok pozrieš pondelok, uvidíš ho správne, lebo sa nič neuložilo.
 */

/** Hodina, ktorú stavové funkcie potrebujú. Časy sú miestne, `HH:MM`. */
export interface SkolskaHodina {
  /** `RRRR-MM-DD`. */
  date: string;
  startTime: string;
  endTime: string;
  cancelled?: boolean;
}

export type LessonState = "past" | "now" | "future";

/* ═══════════════════════════════════════════════════════════════════════════
   STAV HODINY
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Prebehla už hodina, práve beží, alebo ešte len bude?
 *
 * `nowMin` sú minúty od polnoci v pásme používateľa — počíta ich server cez
 * `minutesIn`, nie prehliadač. Klient by po hydratácii dostal iné číslo než
 * server a pruh by preblikol na inú hodinu.
 *
 * Odpadnutá hodina je stále „past/now/future" podľa času; to, že odpadla, je
 * samostatný údaj. Keby sa tu miešali, nedalo by sa povedať „o desiatej mala
 * byť matika, ale odpadla".
 */
export function lessonState(
  hodina: SkolskaHodina,
  todayIso: string,
  nowMin: number,
): LessonState {
  const rozdiel = diffDays(hodina.date, todayIso);
  if (rozdiel > 0) return "past";
  if (rozdiel < 0) return "future";

  const zaciatok = timeToMinutes(hodina.startTime) ?? 0;
  const koniec = timeToMinutes(hodina.endTime) ?? zaciatok;

  if (nowMin >= koniec) return "past";
  if (nowMin >= zaciatok) return "now";
  return "future";
}

/** Koľko hodín už prebehlo. Do pruhu „3 zo 6". */
export function lessonsDone(
  hodiny: readonly SkolskaHodina[],
  todayIso: string,
  nowMin: number,
): number {
  return hodiny.filter((h) => lessonState(h, todayIso, nowMin) === "past").length;
}

/* ═══════════════════════════════════════════════════════════════════════════
   KOĽKO ZOBERIE ŠKOLA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Minúty, ktoré škola zaberie v dni.
 *
 * **Odpadnuté hodiny sa nerátajú** — čas, ktorý sa neučí, je voľný a rozpočet
 * by inak tvrdil, že ho nemáš.
 *
 * Prestávky medzi hodinami sa vedome NErátajú. Desať minút medzi matikou
 * a chémiou nie je čas, do ktorého sa dá naplánovať úloha, ale ani ho appka
 * nemá vydávať za prácu. Berie sa len to, čo naozaj sedíš v triede.
 */
export function schoolMinutes(hodiny: readonly SkolskaHodina[]): number {
  return hodiny.reduce((sucet, h) => {
    if (h.cancelled === true) return sucet;
    const zaciatok = timeToMinutes(h.startTime);
    const koniec = timeToMinutes(h.endTime);
    if (zaciatok === null || koniec === null || koniec <= zaciatok) return sucet;
    return sucet + (koniec - zaciatok);
  }, 0);
}

/**
 * Od kedy do kedy si v škole. `null`, keď v ten deň nič nie je.
 *
 * Berie aj odpadnuté hodiny: keď ti odpadne posledná, do školy si aj tak
 * prišiel na prvú a okno dňa sa tým nemení.
 */
export function schoolWindow(
  hodiny: readonly SkolskaHodina[],
): { start: string; end: string } | null {
  if (hodiny.length === 0) return null;

  let start: string | null = null;
  let end: string | null = null;

  for (const h of hodiny) {
    if (start === null || h.startTime < start) start = h.startTime;
    if (end === null || h.endTime > end) end = h.endTime;
  }

  return start === null || end === null ? null : { start, end };
}

/**
 * Koľko zo školy ešte len bude — od `nowMin` dopredu.
 *
 * Toto je číslo, ktoré patrí do rozpočtu dňa, NIE `schoolMinutes`. Rozpočet
 * na obrazovke „Dnes" počíta, koľko z dňa ešte zostáva — hodiny, ktoré už
 * prebehli, z neho vypadli samy. Keby sa od zvyšku dňa odrátala celá škola,
 * dopoludnie by sa odpočítalo dvakrát a o tretej by rozpočet tvrdil, že máš
 * o tri hodiny menej, než naozaj máš.
 *
 * Prebiehajúca hodina sa ráta len tým kusom, ktorý zostáva: o 12:00 je
 * z hodiny 11:50–12:35 pred tebou 35 minút, nie 45.
 *
 * Iný deň než dnešok nemá „teraz": budúci deň sa ráta celý, minulý nulou.
 */
export function remainingSchoolMinutes(
  hodiny: readonly SkolskaHodina[],
  todayIso: string,
  nowMin: number,
): number {
  return hodiny.reduce((sucet, h) => {
    if (h.cancelled === true) return sucet;

    const zaciatok = timeToMinutes(h.startTime);
    const koniec = timeToMinutes(h.endTime);
    if (zaciatok === null || koniec === null || koniec <= zaciatok) return sucet;

    const rozdiel = diffDays(h.date, todayIso);
    if (rozdiel > 0) return sucet;
    if (rozdiel < 0) return sucet + (koniec - zaciatok);

    /* Dnešok: berie sa len to, čo je ešte pred nami. */
    return sucet + Math.max(0, koniec - Math.max(zaciatok, nowMin));
  }, 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   VOĽNÁ
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SkolskeVolno {
  fromDate: string;
  toDate: string;
}

/** Je ten deň prázdninový? Rozsah platí vrátane oboch krajných dní. */
export function isSchoolBreak(
  dateIso: string,
  volna: readonly SkolskeVolno[],
): boolean {
  return volna.some((v) => v.fromDate <= dateIso && dateIso <= v.toDate);
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAJBLIŽŠIA HODINA PREDMETU
   ═══════════════════════════════════════════════════════════════════════════ */

export interface HodinaPredmetu extends SkolskaHodina {
  subjectId: string;
}

/**
 * Kedy je najbližšia hodina toho predmetu — termín pre domácu úlohu.
 *
 * Napíšeš „domáca úloha na matiku" a appka z rozvrhu vie, že matiku máš
 * najbližšie v utorok. Dátum sa **ponúkne**, nevnucuje.
 *
 * Tri veci, ktoré sa tu ľahko pokazia a preto sú tu naschvál:
 *
 * - **Voľná sa preskakujú.** Bez toho by termín padol na deň, keď škola nie
 *   je, a človek by prišiel s nespravenou úlohou.
 * - **Odpadnutá hodina sa neponúka.** Na hodinu, ktorá nebude, sa úloha
 *   nedonesie.
 * - **Dnešok sa ráta len dovtedy, kým hodina nezačala.** Dať termín na
 *   hodinu, ktorá práve prebieha, je neskoro.
 */
export function nextLessonDate(
  hodiny: readonly HodinaPredmetu[],
  subjectId: string,
  todayIso: string,
  nowMin: number,
  volna: readonly SkolskeVolno[] = [],
): string | null {
  let najblizsia: string | null = null;

  for (const h of hodiny) {
    if (h.subjectId !== subjectId) continue;
    if (h.cancelled === true) continue;
    if (isSchoolBreak(h.date, volna)) continue;
    if (lessonState(h, todayIso, nowMin) !== "future") continue;

    if (najblizsia === null || h.date < najblizsia) najblizsia = h.date;
  }

  return najblizsia;
}

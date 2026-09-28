import { fold } from "@/lib/fold";

/**
 * Nájdenie školského predmetu v názve úlohy.
 *
 * „Fyzika DU" → predmet `FYZ`. Parser sám to spraviť nemôže: musel by vedieť,
 * aké predmety človek má, a to je databáza — `parseCapture` je čistá funkcia
 * bez prístupu k nej. Preto sa predmet dopĺňa až na serveri, rovnako ako
 * projekt podľa názvu.
 *
 * ## Čo sa hľadá
 *
 * 1. **Skratka ako celé slovo** — `FYZ`, `MAT`, `BIO lab`. Presne a bez
 *    falošných zhôd.
 * 2. **Začiatok celého názvu** — `Fyzika` sedí aj na „z fyziky", lebo
 *    slovenčina skloňuje a nikto nepíše prvý pád.
 *
 * Kratšie než päť znakov sa ako názov nehľadá vôbec. „Umenie a kultúra" má
 * skratku `UKL`, ale trojznakový základ by chytal polovicu slovníka.
 *
 * 3. **Bežné meno jazyka** — predmet „Nemecký jazyk" (alebo so skratkou
 *    `NEJ`) sedí aj na „nemčina", lebo tak sa predmet naozaj volá, keď sa
 *    o ňom hovorí. Nie je to prezývka, je to to isté slovo v inom tvare
 *    (`builtInAliases`).
 * 4. **Prezývky z nastavení** — „matika", „nj"… Čo si človek napíše sám,
 *    uloží sa pri skratke predmetu (`settings.subjectAliases`).
 *
 * Mená a prezývky sa hľadajú bez diakritiky a bez ohľadu na veľké písmená.
 * Dlhšie (od piatich znakov) sa skloňujú — „nemčin" chytí „z nemčiny" aj
 * „na nemčinu" — a musia začínať na začiatku slova, aby prezývka „matika"
 * nesedela v „informatike". Kratšie sa berú len ako celé slovo, ako skratky.
 *
 * ## Čo sa NEHĽADÁ
 *
 * Vymyslené prezývky. „matika" na `Matematika` nesedí, kým si ju človek
 * nenapíše do nastavení — appka, ktorá si domýšľa skratky, sa raz zmýli
 * a potom sa kontroluje každý zápis.
 */

export interface SubjectCandidate {
  id: string;
  code: string;
  name: string | null;
  /** Prezývky z nastavení (`settings.subjectAliases[code]`). */
  aliases?: readonly string[];
}

/*
  Bežné mená jazykov. Predmet sa v EduPage volá „Nemecký jazyk", ale doma
  a v zošite je to „nemčina". Kľúčom je prídavné meno bez koncovky (z názvu
  predmetu) a obvyklá skratka EduPage — bez diakritiky, ako po `fold`.
*/
const JAZYKY: readonly { adjektivum: string; skratky: readonly string[]; meno: string }[] = [
  { adjektivum: "anglick", skratky: ["anj", "aj"], meno: "angličtina" },
  { adjektivum: "nemeck", skratky: ["nej", "nj"], meno: "nemčina" },
  { adjektivum: "slovensk", skratky: ["sjl", "slj", "sj"], meno: "slovenčina" },
  { adjektivum: "francuzsk", skratky: ["frj", "fj"], meno: "francúzština" },
  { adjektivum: "spanielsk", skratky: ["spj"], meno: "španielčina" },
  { adjektivum: "rusk", skratky: ["ruj", "rj"], meno: "ruština" },
  { adjektivum: "taliansk", skratky: ["taj", "tj"], meno: "taliančina" },
  { adjektivum: "latinsk", skratky: ["laj", "lat"], meno: "latinčina" },
  { adjektivum: "cesk", skratky: ["cej", "cj"], meno: "čeština" },
];

/**
 * Mená, pod ktorými sa predmet pozná aj bez nastavení — dnes len bežné meno
 * jazyka („Nemecký jazyk" / `NEJ` → „nemčina"). Ukazujú sa aj v nastaveniach,
 * aby bolo vidieť, čo appka rozpozná sama.
 */
export function builtInAliases(subject: Pick<SubjectCandidate, "code" | "name">): string[] {
  const nazov = fold((subject.name ?? "").toLowerCase()).trim();
  const kod = fold(subject.code.toLowerCase()).trim();
  const zhoda = /^([a-z]+)y jazyk$/.exec(nazov);
  const jazyk = JAZYKY.find(
    (j) => (zhoda !== null && zhoda[1] === j.adjektivum) || j.skratky.includes(kod),
  );
  return jazyk === undefined ? [] : [jazyk.meno];
}

/** Prezývka na zápis: orezaná, bez prázdnych a bez opakovania (bez ohľadu na diakritiku). */
export function cleanAliases(raw: readonly string[]): string[] {
  const videne = new Set<string>();
  const out: string[] = [];
  for (const alias of raw) {
    const cista = alias.trim().replace(/\s+/g, " ");
    const kluc = fold(cista.toLowerCase());
    if (cista === "" || videne.has(kluc)) continue;
    videne.add(kluc);
    out.push(cista);
  }
  return out;
}

/** Koľko znakov názvu musí sedieť, aby sa bral ako zhoda. */
const MIN_NAZOV = 5;

const jePismeno = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** Je zhoda na `index` ohraničená tak, že ide o samostatné slovo? */
function celeSlovo(text: string, index: number, dlzka: number): boolean {
  return !jePismeno(text[index - 1]) && !jePismeno(text[index + dlzka]);
}

/** Začína zhoda na `index` nové slovo? (Koniec sa skloňuje, ten sa nekontroluje.) */
function zaciatokSlova(text: string, index: number): boolean {
  return !jePismeno(text[index - 1]);
}

/**
 * Predmet, ktorý v názve sedí. `null`, keď žiadny.
 *
 * Pri viacerých zhodách vyhráva **najdlhšia** — `BIO lab` pred `BIO`, inak by
 * laboratórna hodina vždy vypadla na obyčajnú biológiu.
 */
export function matchSubject(
  title: string,
  subjects: readonly SubjectCandidate[],
): SubjectCandidate | null {
  const text = fold(title.toLowerCase());
  if (text.trim() === "") return null;

  let najlepsiPredmet: SubjectCandidate | null = null;
  let najlepsiaDlzka = 0;

  /**
   * `celeSlovo` — zhoda musí byť samostatné slovo (skratky, krátke prezývky).
   * `zaciatokSlova` — musí začínať na začiatku slova, koniec sa skloňuje.
   */
  function skus(
    predmet: SubjectCandidate,
    hladane: string,
    hranica: "ziadna" | "celeSlovo" | "zaciatokSlova",
  ): void {
    const igla = fold(hladane.toLowerCase()).trim();
    if (igla === "") return;

    let index = text.indexOf(igla);
    while (index >= 0) {
      const ok =
        hranica === "ziadna" ||
        (hranica === "celeSlovo" && celeSlovo(text, index, igla.length)) ||
        (hranica === "zaciatokSlova" && zaciatokSlova(text, index));
      if (ok) break;
      index = text.indexOf(igla, index + 1);
    }
    if (index < 0) return;

    if (najlepsiPredmet === null || igla.length > najlepsiaDlzka) {
      najlepsiPredmet = predmet;
      najlepsiaDlzka = igla.length;
    }
  }

  for (const predmet of subjects) {
    /* Skratka len ako celé slovo: `MAT` sa inak nájde v „matka" aj „automat". */
    skus(predmet, predmet.code, "celeSlovo");

    const nazov = predmet.name ?? "";
    if (nazov.length >= MIN_NAZOV) {
      /*
        Z názvu sa berie základ bez poslednej samohlásky, aby sedelo aj
        skloňovanie: „fyzika" → „fyzik" chytí „z fyziky" aj „na fyzike".
        Ako podreťazec, nie celé slovo — koncovka je práve to, čo sa mení.
      */
      skus(predmet, zaklad(nazov), "ziadna");
    }

    /*
      Bežné meno jazyka a prezývky z nastavení. Dlhé sa skloňujú, ale musia
      začínať na začiatku slova („matika" nie je v „informatike"); krátke
      („nj") len ako celé slovo, rovnako ako skratky.
    */
    for (const prezyvka of [...builtInAliases(predmet), ...(predmet.aliases ?? [])]) {
      if (prezyvka.trim().length >= MIN_NAZOV) skus(predmet, zaklad(prezyvka), "zaciatokSlova");
      else skus(predmet, prezyvka, "celeSlovo");
    }
  }

  return najlepsiPredmet;
}

/** Základ na skloňovanie — bez poslednej samohlásky („nemčina" → „nemčin"). */
function zaklad(slovo: string): string {
  return slovo.trim().replace(/[aeiouyáéíóúýäôě]$/iu, "");
}

/**
 * Je `slovo` (z názvu písomky) predmetom? Tá istá úvaha ako v `matchSubject`,
 * len pre jedno slovo — `assessmentTitle` podľa nej vystrihne predmet
 * z názvu („písomka z nemčiny" → „Písomka").
 */
export function wordNamesSubject(
  slovo: string,
  subject: Pick<SubjectCandidate, "code" | "name" | "aliases">,
): boolean {
  const f = fold(slovo).replace(/[.,;:!?]+$/u, "");
  if (f === "") return false;
  if (f === fold(subject.code)) return true;

  /* Názov ako doteraz: prvých päť písmen („z fyziky" sedí na „Fyzika"). */
  const nazov = subject.name ? fold(subject.name).slice(0, MIN_NAZOV) : "";
  if (nazov.length === MIN_NAZOV && f.startsWith(nazov)) return true;

  /* Meno jazyka a prezývky: dlhé podľa základu („z nemčiny"), krátke celé. */
  return [...builtInAliases(subject), ...(subject.aliases ?? [])].some((prezyvka) => {
    const fp = fold(prezyvka.trim());
    if (fp === "") return false;
    return fp.length >= MIN_NAZOV ? f.startsWith(fold(zaklad(fp))) : f === fp;
  });
}

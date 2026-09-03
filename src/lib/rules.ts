import { fold } from "@/lib/fold";
import { parseCapture } from "@/lib/parse";

/**
 * Automatické prideľovanie štítkov a kontextu podľa toho, čo je v názve.
 *
 * „ísť na tréning" → ponúkne `#trening @domino`. Pravidlá si píše používateľ
 * sám v nastaveniach; appka nič nehádá a nič sa neučí.
 *
 * **Ponúka, nevnucuje.** Funkcia vracia len návrh — vložiť ho je vec
 * rozhrania a človek ho môže odmietnuť alebo vzápätí zmazať. Automaticky
 * priradený štítok, ktorý sa nedá odmietnuť, je horší než žiadny: pri prvom
 * omyle prestaneš appke veriť a začneš kontrolovať každý zápis.
 *
 * Čistá funkcia, bez závislostí na databáze.
 */

export interface AutoTagRule {
  /** Slovo alebo fráza, ktorá sa hľadá v názve. Bez diakritiky nezáleží. */
  match: string;

  /* ── čo pravidlo nastaví ──────────────────────────────────────────────
     Menované veci (oblasť, projekt, predmet…) sa držia POD NÁZVOM, nie pod
     identifikátorom. Text pravidiel si píše človek a musí v ňom vidieť, čo
     tam stojí; navyše nefunkčné `oblast:Zdravie` je vidieť na prvý pohľad,
     kdežto neplatné id by mlčalo. Na identifikátory sa mená prekladajú až
     na serveri, presne ako `+projekt` v rýchlom zachytení.
     ───────────────────────────────────────────────────────────────────── */

  priority?: 1 | 2 | 3;
  energy?: "low" | "mid" | "high";
  /** Minúty. */
  estimateMin?: number;
  projectName?: string;
  areaName?: string;
  /** Školský predmet — skratka alebo celý názov. */
  subjectName?: string;
  schoolKind?: "homework" | "exam";
  /** Lekcia: pilier učenia a prípadne zručnosť pod ním. */
  pillarName?: string;
  skillName?: string;
  habitName?: string;
  horizon?: "day" | "week" | "month" | "someday";
  /** Priorita dňa. */
  isFrog?: boolean;
  /** Neprenášať do ďalšieho dňa. */
  staysOnDay?: boolean;
  /**
   * Štítky na priradenie, bez `#`. Vždy pole — prázdne pravidlo, ktoré
   * priraďuje len kontext, má tu `[]`. Voliteľnosť by sa rozišla so schémou
   * nastavení, kde má pole `.default([])`, a typy by si to potom prehadzovali.
   */
  tags: string[];
  /** Kontext na priradenie, bez `@`. */
  context?: string;
}

export interface AutoTagSuggestion {
  /** Štítky, ktoré v texte ešte nie sú. */
  tags: string[];
  /** Kontext, ak ho text ešte nemá. `null`, keď netreba nič. */
  context: string | null;
}

const EMPTY: AutoTagSuggestion = { tags: [], context: null };

/**
 * Sedí pravidlo na text?
 *
 * Hľadá sa **podreťazec**, nie celé slovo — a to zámerne. Slovenčina skloňuje:
 * „tréning", „tréningu", „na tréningoch" majú spoločný základ a pravidlo
 * `trening` ich chytí všetky. Porovnanie na celé slovo by si vypýtalo pravidlo
 * na každý pád, čo by nikto nevypisoval.
 *
 * Cena je občasná falošná zhoda („pes" v „pesnička"). Preto sa návrh ponúka
 * a nevnucuje — a preto majú pravidlá zmysel len ako krátky vlastný zoznam,
 * nie ako slovník.
 */
function ruleMatches(rule: AutoTagRule, foldedText: string): boolean {
  const needle = fold(rule.match.trim());
  if (needle === "") return false;
  return foldedText.includes(needle);
}

/**
 * Čo by sa dalo doplniť do rozpísaného textu.
 *
 * Vracia iba to, čo tam **ešte nie je** — už napísaný `#trening` sa neponúka
 * druhýkrát. Poradie pravidiel rozhoduje: pri viacerých zhodách vyhráva prvý
 * kontext, štítky sa zlučujú.
 */
export function suggestAutoTags(
  text: string,
  rules: readonly AutoTagRule[],
): AutoTagSuggestion {
  if (rules.length === 0) return EMPTY;

  const trimmed = text.trim();
  if (trimmed === "") return EMPTY;

  const foldedText = fold(trimmed);

  /*
    Čo už v texte je, zisťuje parser — nie vlastný regulárny výraz. Inak by sa
    obe pravdy rozišli a appka by ponúkala štítok, ktorý tam dávno je.
  */
  const parsed = parseCapture(trimmed);
  const existingTags = new Set(parsed.tags.map((tag) => fold(tag)));
  const existingContext =
    parsed.context === undefined ? null : fold(parsed.context.replace(/^@/, ""));

  const tags: string[] = [];
  const seen = new Set<string>();
  let context: string | null = null;

  for (const rule of rules) {
    if (!ruleMatches(rule, foldedText)) continue;

    for (const raw of rule.tags ?? []) {
      const tag = raw.trim().replace(/^#/, "");
      if (tag === "") continue;

      const key = fold(tag);
      if (existingTags.has(key) || seen.has(key)) continue;

      seen.add(key);
      tags.push(tag);
    }

    if (context === null && rule.context !== undefined) {
      const candidate = rule.context.trim().replace(/^@/, "");
      // Kontext je jeden — ak ho text má, príde o návrh celý, nielen o zhodu.
      if (candidate !== "" && existingContext === null) context = candidate;
    }
  }

  return { tags, context };
}

/** Je vôbec čo ponúknuť? Rozhranie sa podľa toho rozhoduje, či niečo zobrazí. */
export function hasSuggestion(suggestion: AutoTagSuggestion): boolean {
  return suggestion.tags.length > 0 || suggestion.context !== null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREVOD NA TEXT A SPÄŤ

   Pravidlá sa v nastaveniach zadávajú ako text, riadok na pravidlo:

       trening = #trening @domino
       faktura = #financie #praca

   Prevod žije tu, nie v komponente: sú to čisté funkcie a v komponente by sa
   nedali otestovať. Práve tu pritom vzniká najviac chýb — okolo medzier,
   prázdnych riadkov a rozpísaného textu.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Slovníky pre pomenované hodnoty.
 *
 * Bez diakritiky a malými písmenami — pravidlá si človek píše na klávesnici,
 * na ktorej práve je, a nikto nebude riešiť dĺžne.
 */
const ENERGIA_ZO_SLOVA: Record<string, "low" | "mid" | "high" | undefined> = {
  nizka: "low",
  slaba: "low",
  low: "low",
  stredna: "mid",
  mid: "mid",
  vysoka: "high",
  silna: "high",
  high: "high",
};

const ENERGIA_NA_SLOVO: Record<"low" | "mid" | "high", string> = {
  low: "nizka",
  mid: "stredna",
  high: "vysoka",
};

const HORIZONT_ZO_SLOVA: Record<string, AutoTagRule["horizon"]> = {
  den: "day",
  dnes: "day",
  day: "day",
  tyzden: "week",
  week: "week",
  mesiac: "month",
  month: "month",
  niekedy: "someday",
  someday: "someday",
};

const HORIZONT_NA_SLOVO: Record<string, string> = {
  day: "den",
  week: "tyzden",
  month: "mesiac",
  someday: "niekedy",
};

const SKOLA_ZO_SLOVA: Record<string, "homework" | "exam" | undefined> = {
  du: "homework",
  uloha: "homework",
  homework: "homework",
  pisomka: "exam",
  test: "exam",
  skuska: "exam",
  exam: "exam",
};

/** Značky tvaru `kluc:hodnota`, ktoré nesú meno alebo slovo. */
const KLUCE: Record<string, keyof AutoTagRule | undefined> = {
  oblast: "areaName",
  predmet: "subjectName",
  pilier: "pillarName",
  zrucnost: "skillName",
  navyk: "habitName",
  skola: "schoolKind",
  horizont: "horizon",
};

/**
 * Pravidlo na jeden riadok textu.
 *
 * Zámerne **tá istá syntax ako v rýchlom zachytení** — `#štítok`, `@kontext`,
 * `+projekt`, `!2`, `!!vysoka`, `45m`. Kto vie zapísať úlohu, vie napísať aj
 * pravidlo a nemusí sa učiť druhý jazyk. Pomenované veci, na ktoré značka
 * neexistuje, majú tvar `kľúč:hodnota`.
 */
export function rulesToText(rules: readonly AutoTagRule[]): string {
  return rules
    .map((rule) => {
      const parts: string[] = [
        ...(rule.tags ?? []).map((tag) => `#${tag}`),
        ...(rule.context ? [`@${rule.context}`] : []),
        ...(rule.projectName ? [`+${rule.projectName.replace(/\s+/g, "-")}`] : []),
        ...(rule.priority ? [`!${rule.priority}`] : []),
        ...(rule.energy ? [`!!${ENERGIA_NA_SLOVO[rule.energy]}`] : []),
        ...(rule.estimateMin
          ? [rule.estimateMin % 60 === 0 ? `${rule.estimateMin / 60}h` : `${rule.estimateMin}m`]
          : []),
        ...(rule.areaName ? [`oblast:${rule.areaName}`] : []),
        ...(rule.subjectName ? [`predmet:${rule.subjectName}`] : []),
        ...(rule.schoolKind
          ? [`skola:${rule.schoolKind === "exam" ? "pisomka" : "du"}`]
          : []),
        ...(rule.pillarName ? [`pilier:${rule.pillarName}`] : []),
        ...(rule.skillName ? [`zrucnost:${rule.skillName}`] : []),
        ...(rule.habitName ? [`navyk:${rule.habitName}`] : []),
        ...(rule.horizon ? [`horizont:${HORIZONT_NA_SLOVO[rule.horizon]}`] : []),
        ...(rule.isFrog === true ? ["zaba"] : []),
        ...(rule.staysOnDay === true ? ["drzi"] : []),
      ];
      return `${rule.match} = ${parts.join(" ")}`.trimEnd();
    })
    .join("\n");
}

/** Rozdelí `kluc:hodnota`. Hodnota môže mať medzery, keď je v úvodzovkách. */
function citajKluc(token: string): { kluc: string; hodnota: string } | null {
  const dvojbodka = token.indexOf(":");
  if (dvojbodka <= 0) return null;

  const kluc = fold(token.slice(0, dvojbodka).toLowerCase());
  const hodnota = token.slice(dvojbodka + 1).replace(/^"|"$/g, "").trim();
  return hodnota === "" ? null : { kluc, hodnota };
}

/**
 * Prečíta pravidlá z textu.
 *
 * Riadky, ktorým nerozumie, **ticho preskočí** — rozpísaný riadok uprostred
 * písania nesmie zhodiť zvyšok zoznamu. Rovnako sa preskočí neznáma značka:
 * preklep v jednom slove nesmie zahodiť celé pravidlo.
 *
 * Hodnota s medzerami sa píše do úvodzoviek: `oblast:"Osobný rozvoj"`.
 */
export function textToRules(text: string): AutoTagRule[] {
  const rules: AutoTagRule[] = [];

  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 0) continue;

    const match = line.slice(0, separator).trim();
    if (match === "") continue;

    const rule: AutoTagRule = { match, tags: [] };
    /* Úvodzovky držia hodnotu pohromade — `oblast:"Osobný rozvoj"`. */
    const tokens = line.slice(separator + 1).trim().match(/[^\s"]*"[^"]*"|\S+/g) ?? [];

    for (const token of tokens) {
      if (token.startsWith("#") && token.length > 1) {
        rule.tags.push(token.slice(1));
        continue;
      }
      if (token.startsWith("@") && token.length > 1 && rule.context === undefined) {
        rule.context = token.slice(1);
        continue;
      }
      if (token.startsWith("+") && token.length > 1 && rule.projectName === undefined) {
        rule.projectName = token.slice(1).replace(/-/g, " ");
        continue;
      }
      if (/^!![a-zA-Zá-žÁ-Ž]+$/u.test(token)) {
        rule.energy = ENERGIA_ZO_SLOVA[fold(token.slice(2).toLowerCase())];
        if (rule.energy === undefined) delete rule.energy;
        continue;
      }
      if (/^![123]$/.test(token)) {
        rule.priority = Number(token.slice(1)) as 1 | 2 | 3;
        continue;
      }
      if (/^\d+\s*[mh]$/i.test(token)) {
        const cislo = Number(token.replace(/[^\d]/g, ""));
        if (cislo > 0) rule.estimateMin = /h$/i.test(token) ? cislo * 60 : cislo;
        continue;
      }
      if (fold(token.toLowerCase()) === "zaba") {
        rule.isFrog = true;
        continue;
      }
      if (fold(token.toLowerCase()) === "drzi") {
        rule.staysOnDay = true;
        continue;
      }

      const par = citajKluc(token);
      if (par === null) continue;

      const pole = KLUCE[par.kluc];
      if (pole === undefined) continue;

      if (pole === "schoolKind") {
        const druh = SKOLA_ZO_SLOVA[fold(par.hodnota.toLowerCase())];
        if (druh !== undefined) rule.schoolKind = druh;
        continue;
      }
      if (pole === "horizon") {
        const h = HORIZONT_ZO_SLOVA[fold(par.hodnota.toLowerCase())];
        if (h !== undefined) rule.horizon = h;
        continue;
      }

      /*
        Ostatné kľúče nesú obyčajné meno. Priradenie ide cez `unknown`, lebo
        `pole` je union kľúčov s rôznymi typmi a TypeScript pri zápise cez
        premennú nevie, že sem chodia len tie textové.
      */
      (rule as unknown as Record<string, unknown>)[pole] = par.hodnota;
    }

    /* Pravidlo, ktoré nič nenastavuje, je len rozpísaný riadok. */
    if (!nastavujeNieco(rule)) continue;
    rules.push(rule);
  }

  return rules;
}

/** Nastavuje pravidlo vôbec niečo? Prázdne pravidlo sa neukladá. */
function nastavujeNieco(rule: AutoTagRule): boolean {
  if (rule.tags.length > 0) return true;
  return (
    Object.entries(rule).filter(
      ([kluc, hodnota]) =>
        kluc !== "match" && kluc !== "tags" && hodnota !== undefined,
    ).length > 0
  );
}


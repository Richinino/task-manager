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

export function rulesToText(rules: readonly AutoTagRule[]): string {
  return rules
    .map((rule) => {
      const parts = [
        ...(rule.tags ?? []).map((tag) => `#${tag}`),
        ...(rule.context !== undefined && rule.context !== ""
          ? [`@${rule.context}`]
          : []),
      ];
      return `${rule.match} = ${parts.join(" ")}`.trimEnd();
    })
    .join("\n");
}

/**
 * Prečíta pravidlá z textu.
 *
 * Riadky, ktorým nerozumie, **ticho preskočí** — rozpísaný riadok uprostred
 * písania nesmie zhodiť zvyšok zoznamu. Kontext je jeden na pravidlo, takže
 * druhý zapísaný sa ignoruje.
 */
export function textToRules(text: string): AutoTagRule[] {
  const rules: AutoTagRule[] = [];

  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 0) continue;

    const match = line.slice(0, separator).trim();
    if (match === "") continue;

    const tags: string[] = [];
    let context: string | undefined;

    for (const token of line.slice(separator + 1).trim().split(/\s+/)) {
      if (token.startsWith("#") && token.length > 1) tags.push(token.slice(1));
      else if (token.startsWith("@") && token.length > 1 && context === undefined) {
        context = token.slice(1);
      }
    }

    if (tags.length === 0 && context === undefined) continue;
    rules.push({ match, tags, ...(context !== undefined ? { context } : {}) });
  }

  return rules;
}

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
  /** Štítky na priradenie, bez `#`. */
  tags?: string[];
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

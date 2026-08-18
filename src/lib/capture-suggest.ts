/**
 * Našepkávanie v rýchlom zachytení.
 *
 * Odpovedá na jedinú otázku: **píše práve človek značku, a ak áno, akú?**
 * Podľa toho sa dá ponúknuť zoznam a doplniť vybranú hodnotu.
 *
 * Prečo to nerieši `capture-syntax.ts`: tá prepína CELÝ token kdekoľvek
 * v texte (to chcú čipy — „nastav prioritu 1, nech je kdekoľvek"). Tu ide
 * o niečo iné — o slovo pod kurzorom, ktoré sa práve píše a má sa dokončiť.
 * Sú to dve rôzne operácie a zlúčiť ich by znamenalo pokaziť obe.
 *
 * Čistá funkcia bez `new Date()` a bez závislostí na databáze.
 */

/** Druh značky, ktorý sa dá našepkať. */
export type SuggestKind = "context" | "tag" | "project";

export interface SuggestTrigger {
  kind: SuggestKind;
  /** Text za značkou, bez prefixu. Môže byť prázdny (`@` bez písmen). */
  query: string;
  /** Index prefixu v texte. */
  start: number;
  /** Index za posledným znakom značky — sem sa vloží doplnená hodnota. */
  end: number;
}

const PREFIXES: Record<string, SuggestKind> = {
  "@": "context",
  "#": "tag",
  "+": "project",
};

/**
 * Znaky, ktoré do značky patria.
 *
 * Zámerne to isté, čo pozná parser (`RE_CONTEXT`, `RE_TAG`, `RE_PROJECT`
 * v `src/lib/parse.ts`): písmená, číslice, podtržník a spojovník. Keby sa
 * rozišli, našepkávač by ponúkal dokončenie tam, kde by parser značku
 * nerozpoznal.
 */
function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}_-]/u.test(char);
}

/**
 * Je znak pred značkou taký, že značka naozaj začína?
 *
 * Parser vyžaduje, aby pred prefixom nebolo písmeno ani číslica — inak by
 * sa „e-mail@firma.sk" čítalo ako kontext. Tá istá podmienka platí tu.
 */
function isBoundary(char: string | undefined): boolean {
  return char === undefined || !/[\p{L}\p{N}]/u.test(char);
}

/**
 * Ktorú značku človek práve píše, ak vôbec nejakú.
 *
 * `caret` je pozícia kurzora. Hľadá sa **doľava od kurzora** po najbližší
 * prefix; keď sa cestou narazí na medzeru alebo iný neplatný znak, značka to
 * nie je a vráti sa `null`.
 */
export function activeTrigger(text: string, caret: number): SuggestTrigger | null {
  const position = Math.max(0, Math.min(caret, text.length));

  for (let index = position - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (char === undefined) return null;

    const kind = PREFIXES[char];
    if (kind !== undefined) {
      if (!isBoundary(text[index - 1])) return null;

      const query = text.slice(index + 1, position);
      // Medzera vnútri značky znamená, že sa už nepíše — „@doma a potom".
      if (query !== "" && ![...query].every(isWordChar)) return null;

      return { kind, query, start: index, end: position };
    }

    // Písmená a číslice sú súčasť značky, čokoľvek iné ju ukončuje.
    if (!isWordChar(char)) return null;
  }

  return null;
}

/**
 * Doplní vybranú hodnotu na miesto rozpísanej značky.
 *
 * Za doplnenú značku sa pridá medzera — bez nej by ďalšie písmeno pokračovalo
 * v tej istej značke a človek by musel medzeru písať sám. Keď medzera hneď za
 * značkou už je, druhá sa nepridáva.
 */
export function applySuggestion(
  text: string,
  trigger: SuggestTrigger,
  value: string,
): { text: string; cursor: number } {
  const prefix = Object.keys(PREFIXES).find(
    (key) => PREFIXES[key] === trigger.kind,
  );
  if (prefix === undefined) return { text, cursor: trigger.end };

  const clean = value.trim().replace(/^[@#+]/, "");
  if (clean === "") return { text, cursor: trigger.end };

  const before = text.slice(0, trigger.start);
  const after = text.slice(trigger.end);
  const needsSpace = !after.startsWith(" ");
  const inserted = `${prefix}${clean}${needsSpace ? " " : ""}`;

  return {
    text: `${before}${inserted}${after}`,
    cursor: before.length + inserted.length,
  };
}

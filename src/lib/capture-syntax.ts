/**
 * Vkladanie a nahrádzanie tokenov v texte rýchleho zachytenia.
 *
 * Čipy pod políčkom nenastavujú žiadny skrytý stav — iba VKLADAJÚ SYNTAX
 * DO TEXTU. Text tak ostáva jediným zdrojom pravdy, živý náhľad parsera
 * funguje ďalej a používateľ sa syntax naučí mimochodom, lebo vidí, čo mu
 * ťuknutie vložilo.
 *
 * Tri zásady, ktoré držia modul pohromade:
 *
 * 1. **Existujúce tokeny nehľadáme vlastnými regulárnymi výrazmi.** Pýtame sa
 *    `parseCapture`, ktorý každý token vracia s presnými `start`/`end` do
 *    pôvodného textu. Vďaka tomu sa vkladanie nikdy nerozíde s parserom —
 *    keď sa zmení parser, zmení sa automaticky aj toto.
 * 2. **Vložený tvar musí parser prečítať späť na tú istú hodnotu.** Pri
 *    dátumoch to aj overujeme: krátky tvar `20.8.` znamená „najbližší budúci
 *    výskyt", takže pre dátum, ktorý už tento rok bol, sa musí dopísať rok.
 * 3. **Text sa nesmie zašpiniť.** Po nahradení ani po odstránení tokenu
 *    nevzniknú dvojité medzery, medzera na konci ani medzera pred čiarkou.
 */

import { parseIsoDate, toIsoDate, today } from "@/lib/dates";
import { parseCapture } from "@/lib/parse";

/* ═══════════════════════════════════════════════════════════════════════════
   VEREJNÉ TYPY
   ═══════════════════════════════════════════════════════════════════════════ */

export type SyntaxKind =
  | "priority"
  | "energy"
  | "estimate"
  | "due"
  | "planned"
  | "context";

export interface SyntaxValue {
  priority: 1 | 2 | 3;
  energy: "low" | "mid" | "high";
  /** Minúty. */
  estimate: number;
  /** RRRR-MM-DD */
  due: string;
  /** RRRR-MM-DD */
  planned: string;
  /** Bez `@`. */
  context: string;
}

export interface SyntaxOptions {
  now?: Date;
  weekStartsOn?: number;
}

/** Výsledok úpravy textu — nový text a kam patrí kurzor. */
export interface SyntaxEdit {
  text: string;
  cursor: number;
}

export type ActiveTokens = Partial<{ [K in SyntaxKind]: SyntaxValue[K] }>;

/* ═══════════════════════════════════════════════════════════════════════════
   VYKRESLENIE TOKENU
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Slová energie píšeme bez diakritiky — parser ju nevyžaduje a takto sa
 * token dá dopísať aj na klávesnici bez slovenského rozloženia.
 */
const ENERGY_WORD: Record<string, string | undefined> = {
  low: "nizka",
  mid: "stredna",
  high: "vysoka",
};

/**
 * Hodnoty prichádzajú z UI, preto sa overujú za behu. Neplatná hodnota
 * vráti `null` a volajúci text nechá tak — čip nikdy nesmie text pokaziť.
 */
function renderToken(
  kind: SyntaxKind,
  value: unknown,
  options?: SyntaxOptions,
): string | null {
  switch (kind) {
    case "priority":
      return value === 1 || value === 2 || value === 3 ? `!${value}` : null;

    case "energy": {
      const word = typeof value === "string" ? ENERGY_WORD[value] : undefined;
      return word === undefined ? null : `!!${word}`;
    }

    case "estimate": {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      const minutes = Math.round(value);
      if (minutes < 1) return null;
      // Celé hodiny píšeme ako „2h", zvyšok v minútach („90m").
      return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
    }

    case "due":
    case "planned":
      return typeof value === "string" ? renderDate(value, kind, options) : null;

    case "context": {
      if (typeof value !== "string") return null;
      const slug = value
        .replace(/^@+/u, "")
        .replace(/\s+/gu, "-")
        .replace(/[^\p{L}\p{N}_-]/gu, "");
      return slug.length === 0 ? null : `@${slug}`;
    }
  }

  return null;
}

/**
 * Dátum na text, ktorý parser prečíta späť na ten istý deň.
 *
 * Krátky tvar `20.8.` znamená pre parser najbližší budúci výskyt, takže
 * dátum z iného roku — ale aj dátum, ktorý tento rok už bol — potrebuje rok
 * vypísaný. Krátky tvar preto ešte skúšobne prehodíme parserom.
 */
function renderDate(
  iso: string,
  kind: "due" | "planned",
  options?: SyntaxOptions,
): string | null {
  const date = parseIsoDate(iso);
  // `toIsoDate` odhalí aj dátum, ktorý sa pretiekol („2026-02-31" → 3. marec).
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== iso) return null;

  const prefix = kind === "due" ? "do " : "";
  const dayMonth = `${date.getDate()}.${date.getMonth() + 1}.`;
  const short = `${prefix}${dayMonth}`;
  const full = `${short}${date.getFullYear()}`;

  const currentYear = parseIsoDate(today(options?.now)).getFullYear();
  if (date.getFullYear() !== currentYear) return full;

  const probe = parseCapture(short, options);
  const back = kind === "due" ? probe.dueDate : probe.plannedDate;
  return back === iso ? short : full;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ÚPRAVA TEXTU
   ═══════════════════════════════════════════════════════════════════════════ */

/** Interpunkcia, pred ktorou sa medzera nedopisuje. `!` a `?` v zozname byť nesmú — začínajú tokeny. */
const GLUE_PUNCT = ",.;:)]";

function isGlue(ch: string | undefined): boolean {
  return ch !== undefined && GLUE_PUNCT.includes(ch);
}

/**
 * Nahradí úsek `start`–`end` textom `insert` a upratá medzery na oboch rezoch.
 * Prázdny `insert` znamená odstránenie tokenu.
 */
function spliceRange(
  text: string,
  start: number,
  end: number,
  insert: string,
): SyntaxEdit {
  const head = text.slice(0, start).replace(/\s+$/u, "");
  const tail = text.slice(end).replace(/^\s+/u, "");

  let out = head;
  let cursor = head.length;

  if (insert.length > 0) {
    if (out.length > 0) out += " ";
    out += insert;
    cursor = out.length;
  }

  if (tail.length > 0) {
    if (out.length > 0 && !isGlue(tail[0])) out += " ";
    out += tail;
  }

  /*
    Text sa vracia bez medzery na konci — je to zámerná vlastnosť, na ktorej
    stoja testy čistoty. Pozor ale pri použití vo vstupnom poli: keď token
    skončí na konci a používateľ hneď píše ďalej, písmeno sa naň nalepí
    a `!1x` už parser ako prioritu neprečíta. Volajúci si preto pred zápisom
    do poľa medzeru doplní sám (viď `applyEdit` v quick-capture.tsx).
  */
  return { text: out, cursor };
}

/** Rozsah tokenu daného druhu v texte, alebo `null`, ak tam taký token nie je. */
function findRange(
  text: string,
  kind: SyntaxKind,
  options?: SyntaxOptions,
): { start: number; end: number } | null {
  const token = parseCapture(text, options).tokens.find((t) => t.kind === kind);
  return token === undefined ? null : { start: token.start, end: token.end };
}

/* ═══════════════════════════════════════════════════════════════════════════
   VEREJNÉ API
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Vloží token, alebo ten istý druh nahradí. Vracia text a kam dať kurzor.
 *
 * Kurzor ukazuje tesne za vložený token, aby doň volajúci mohol vrátiť fokus
 * a používateľ mohol písať ďalej.
 */
export function applyToken<K extends SyntaxKind>(
  text: string,
  kind: K,
  value: SyntaxValue[K],
  options?: SyntaxOptions,
): SyntaxEdit {
  const rendered = renderToken(kind, value, options);
  if (rendered === null) return { text, cursor: text.length };

  const range = findRange(text, kind, options);
  if (range === null) return spliceRange(text, text.length, text.length, rendered);
  return spliceRange(text, range.start, range.end, rendered);
}

/** Odstráni token daného druhu, ak v texte je. */
export function removeToken(
  text: string,
  kind: SyntaxKind,
  options?: SyntaxOptions,
): SyntaxEdit {
  const range = findRange(text, kind, options);
  if (range === null) return { text, cursor: text.length };
  return spliceRange(text, range.start, range.end, "");
}

/** Čo je v texte práve nastavené — na zvýraznenie aktívnych čipov. */
export function activeTokens(text: string, options?: SyntaxOptions): ActiveTokens {
  const parsed = parseCapture(text, options);
  const out: ActiveTokens = {};

  if (parsed.priority !== undefined) out.priority = parsed.priority;
  if (parsed.energy !== undefined) out.energy = parsed.energy;
  if (parsed.estimateMin !== undefined) out.estimate = parsed.estimateMin;
  if (parsed.dueDate !== undefined) out.due = parsed.dueDate;
  if (parsed.plannedDate !== undefined) out.planned = parsed.plannedDate;
  // `ParsedCapture.context` nesie aj `@`, čipy pracujú s holým názvom.
  if (parsed.context !== undefined) out.context = parsed.context.replace(/^@/u, "");

  return out;
}

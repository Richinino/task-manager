/**
 * Klávesové skratky — čistý modul bez závislosti na Reacte.
 *
 * Tri veci, ktoré tu žijú:
 *
 * 1. **Rozpoznanie prvku, ktorému klávesy patria.** Appka je keyboard-first,
 *    ale kým používateľ píše, klávesy patria jemu. Skratka bez modifikátora
 *    preto v inpute, textarey ani v contenteditable NIKDY nezaberie — a rovnako
 *    mlčí vnútri otvoreného prekrytia (Radix Select, dialóg, menu), kde si
 *    jednoznakové klávesy berie typeahead daného widgetu.
 * 2. **Normalizácia udalosti na reťazec** typu `"ctrl+k"`. Modifikátory idú
 *    vždy v pevnom poradí, takže porovnanie je obyčajná rovnosť reťazcov.
 * 3. **Register skratiek s odhlásením.** `registerShortcuts` vracia funkciu,
 *    ktorá poslucháča odoberie — presne to, čo chce vrátiť `useEffect`.
 *
 * Zápis `"mod+k"` znamená Ctrl na Windowse a Linuxe, Cmd na macOS. Rozvinie
 * sa na dve konkrétne kombinácie, takže obe fungujú všade.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   SLOVNÍKY
   ═══════════════════════════════════════════════════════════════════════════ */

/** Pevné poradie modifikátorov — bez neho by „ctrl+shift+k" a „shift+ctrl+k"
 *  boli dva rôzne reťazce. */
const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"] as const;

export type Modifier = (typeof MODIFIER_ORDER)[number];

/** Ako sa modifikátory reálne píšu — vrátane macOS názvov. */
const MODIFIER_ALIASES: Record<string, Modifier> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  opt: "alt",
  option: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
  win: "meta",
};

/** Zástupca za „Ctrl na Windowse, Cmd na Macu". */
const MOD_TOKEN = "mod";

/** Zjednotenie názvov klávesov, aby „Esc" aj „Escape" znamenali to isté. */
const KEY_ALIASES: Record<string, string> = {
  " ": "space",
  spacebar: "space",
  esc: "escape",
  del: "delete",
  ins: "insert",
  return: "enter",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  pgup: "pageup",
  pgdn: "pagedown",
  pgdown: "pagedown",
};

/**
 * Typy `<input>`, ktoré sa nedajú písať — pri nich skratky pokojne fungujú.
 * Všetko ostatné (text, search, email, url, number, dátumy…) je písanie.
 */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** ARIA roly, ktoré sa správajú ako textové pole, aj keď to nie je `<input>`. */
const TEXT_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);

/**
 * Otvorené prekrytia, ktoré si jednoznakové klávesy riešia samy.
 *
 * Radix Select po otvorení presunie fokus na `<div role="option">` vnútri
 * `<div role="listbox">` a jeho typeahead pri jednoznakovom klávese NEVOLÁ
 * `preventDefault`. Bez tejto kontroly by globálne „n" alebo „t" odnavigovalo
 * preč práve vo chvíli, keď používateľ píše názov položky. To isté platí pre
 * dialógy a menu — kým je nad stránkou prekrytie, globálne skratky mlčia.
 *
 * `aria-expanded="true"` v zozname zámerne NIE JE: nesie ho aj obyčajný
 * rozbaľovací spínač (napr. „Po termíne" v `overdue-section.tsx`) a skratky
 * by prestali fungovať len preto, že je na ňom fokus.
 */
const OVERLAY_SELECTOR = [
  '[role="listbox"]',
  '[role="option"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="menuitem"]',
].join(", ");

/* ═══════════════════════════════════════════════════════════════════════════
   KOMU PATRIA KLÁVESY
   ═══════════════════════════════════════════════════════════════════════════ */

function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

/**
 * Je tento prvok pole, do ktorého sa píše? Rieši `<input>` s písateľným typom,
 * `<textarea>`, `<select>`, contenteditable (vrátane zdedeného) a textové ARIA roly.
 */
export function isTextInputElement(element: Element | null): boolean {
  if (element === null) return false;

  // `isContentEditable` platí aj pre potomkov editovateľnej oblasti —
  // preto sa neriešime s atribútom, ale s vypočítanou vlastnosťou.
  if (element instanceof HTMLElement && element.isContentEditable) return true;

  const role = element.getAttribute("role");
  if (role !== null && TEXT_ROLES.has(role.toLowerCase())) return true;

  const tag = element.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }

  return false;
}

/**
 * Je prvok vnútri otvoreného prekrytia (select, dialóg, menu)?
 * `closest` hľadá aj cez portál, lebo Radix si obsah vykresľuje do `<body>`,
 * ale fokusovaná položka je vždy potomkom toho portálového koreňa.
 */
export function isInsideOverlay(element: Element | null): boolean {
  if (element === null) return false;
  return element.closest(OVERLAY_SELECTOR) !== null;
}

/**
 * Patria jednoznakové klávesy tomuto prvku, a nie globálnym skratkám?
 * Jediná odpoveď pre celú appku — kto si robí vlastnú kópiu tejto úvahy,
 * skôr či neskôr sa s ňou rozíde.
 */
export function ownsTypedKeys(element: Element | null): boolean {
  return isTextInputElement(element) || isInsideOverlay(element);
}

/** To isté, ale rovno pre `event.target`. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return isElement(target) && ownsTypedKeys(target);
}

/** Berie si klávesy práve teraz niekto v dokumente? (Podľa aktívneho prvku.) */
export function isTypingInDocument(doc?: Document): boolean {
  const target = doc ?? (typeof document === "undefined" ? null : document);
  return target !== null && ownsTypedKeys(target.activeElement);
}

/* ═══════════════════════════════════════════════════════════════════════════
   NORMALIZÁCIA
   ═══════════════════════════════════════════════════════════════════════════ */

/** „Escape" → „escape", „K" → „k", „ " → „space". */
export function normalizeKey(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

function joinCombo(modifiers: ReadonlySet<Modifier>, key: string): string {
  const parts: string[] = [];
  for (const modifier of MODIFIER_ORDER) {
    if (modifiers.has(modifier)) parts.push(modifier);
  }
  parts.push(key);
  return parts.join("+");
}

/**
 * Klávesová udalosť → `"ctrl+k"`.
 * Stlačenie samotného modifikátora vráti prázdny reťazec — nie je to skratka.
 */
export function normalizeKeyEvent(event: KeyboardEvent): string {
  const key = normalizeKey(event.key);
  if (key === "" || MODIFIER_ALIASES[key] !== undefined) return "";

  const modifiers = new Set<Modifier>();
  if (event.ctrlKey) modifiers.add("ctrl");
  if (event.altKey) modifiers.add("alt");
  if (event.shiftKey) modifiers.add("shift");
  if (event.metaKey) modifiers.add("meta");

  return joinCombo(modifiers, key);
}

interface ComboParts {
  modifiers: Set<Modifier>;
  usesMod: boolean;
  key: string | null;
}

function splitCombo(combo: string): ComboParts {
  const modifiers = new Set<Modifier>();
  let usesMod = false;
  let key: string | null = null;

  for (const rawPart of combo.split("+")) {
    const part = rawPart.trim().toLowerCase();
    if (part === "") continue;
    if (part === MOD_TOKEN) {
      usesMod = true;
      continue;
    }
    const modifier = MODIFIER_ALIASES[part];
    if (modifier !== undefined) {
      modifiers.add(modifier);
      continue;
    }
    // Posledný nemodifikátor je samotná klávesa.
    key = normalizeKey(part);
  }

  return { modifiers, usesMod, key };
}

/**
 * Zápis skratky → konkrétne kombinácie.
 * `"mod+k"` sa rozvinie na `["ctrl+k", "meta+k"]`, aby fungoval Windows aj Mac.
 * Nezmyselný zápis (bez klávesy) vráti prázdne pole — nikdy nevyhodí výnimku.
 */
export function expandCombo(combo: string): string[] {
  const { modifiers, usesMod, key } = splitCombo(combo);
  if (key === null) return [];

  // Vlastná konštanta, aby si TypeScript udržal zúženie aj vnútri funkcie nižšie.
  const finalKey = key;
  const build = (extra?: Modifier): string => {
    const all = new Set(modifiers);
    if (extra !== undefined) all.add(extra);
    return joinCombo(all, finalKey);
  };

  return usesMod ? [build("ctrl"), build("meta")] : [build()];
}

/** Má skratka modifikátor? Len taká smie zabrať aj počas písania. */
export function comboHasModifier(combo: string): boolean {
  const { modifiers, usesMod } = splitCombo(combo);
  return usesMod || modifiers.size > 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   REGISTER
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Shortcut {
  /** Zápis skratky, napr. `"n"`, `"ctrl+n"`, `"mod+k"`. Viac zápisov tej istej
   *  akcie sa dá odovzdať poľom. */
  keys: string | readonly string[];
  /** Čo sa má stať. */
  run: (event: KeyboardEvent) => void;
  /** Predvolene `true` — skratka zhltne predvolené správanie prehliadača. */
  preventDefault?: boolean;
}

export interface RegisterShortcutsOptions {
  /** Kam sa poslucháč pripne. Predvolene `document`. */
  target?: EventTarget | null;
}

interface Entry {
  combo: string;
  hasModifier: boolean;
  shortcut: Shortcut;
}

function toKeyList(keys: string | readonly string[]): readonly string[] {
  return typeof keys === "string" ? [keys] : keys;
}

/**
 * Zaregistruje skratky a vráti funkciu na odhlásenie.
 *
 * ```ts
 * useEffect(() => registerShortcuts([{ keys: "mod+k", run: open }]), [open]);
 * ```
 *
 * Pravidlo, ktoré sa nedá obísť: kým je fokus v textovom poli alebo vnútri
 * otvoreného prekrytia, zaberú **iba** skratky s modifikátorom. Holé `n`
 * alebo `t` patria písaniu, respektíve typeaheadu daného widgetu.
 */
export function registerShortcuts(
  shortcuts: readonly Shortcut[],
  options?: RegisterShortcutsOptions,
): () => void {
  const noop = (): void => {};
  const target =
    options?.target ?? (typeof document === "undefined" ? null : document);
  if (target === null) return noop;

  const entries: Entry[] = [];
  for (const shortcut of shortcuts) {
    for (const keys of toKeyList(shortcut.keys)) {
      const hasModifier = comboHasModifier(keys);
      for (const combo of expandCombo(keys)) {
        entries.push({ combo, hasModifier, shortcut });
      }
    }
  }
  if (entries.length === 0) return noop;

  const handler = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    // Rozpísané IME (čínština, japončina…) posiela medzistavy — do tých sa nestarieme.
    if (keyboardEvent.isComposing || keyboardEvent.keyCode === 229) return;
    if (keyboardEvent.defaultPrevented) return;

    const combo = normalizeKeyEvent(keyboardEvent);
    if (combo === "") return;

    const typing = isTypingTarget(keyboardEvent.target);

    for (const entry of entries) {
      if (entry.combo !== combo) continue;
      if (typing && !entry.hasModifier) continue;
      if (entry.shortcut.preventDefault !== false) keyboardEvent.preventDefault();
      entry.shortcut.run(keyboardEvent);
      return;
    }
  };

  target.addEventListener("keydown", handler);
  return () => target.removeEventListener("keydown", handler);
}

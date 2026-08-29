import type * as React from "react";

import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   SPOLOČNÁ GRAMATIKA OBRAZOVIEK

   Návrh dáva každej obrazovke ten istý rám: 48 px hlavička s linkou, pod ňou
   voliteľný pásik štítkov a úplne dole 34 px stavový riadok. Rozmery sú
   z návrhu a sú na všetkých obrazovkách rovnaké — preto sú tu raz a nie
   trinásťkrát opísané v jednotlivých pohľadoch.

   Žiadny z týchto prvkov nemá vonkajšie odsadenie ani `max-w`. Obsah ide od
   kraja po kraj a sekcie oddeľujú linky, nie medzery — to je celý rozdiel
   oproti kartičkovému vzhľadu, ktorý tu bol predtým.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ScreenHeaderProps {
  /** Nadpis obrazovky. Vykreslí sa ako `h1`. */
  title: React.ReactNode;
  /**
   * Malý štítok hneď za nadpisom — „tento týždeň", „dnes".
   *
   * Je to stav, nie ovládanie: keď je pravdivý, ukáže sa; inak sa nekreslí
   * vôbec. Prázdne miesto po ňom si nedrží.
   */
  chip?: React.ReactNode;
  /** Strojopisný doplnok — počty, odhady, dátum. */
  meta?: React.ReactNode;
  /** Ovládanie vpravo. */
  children?: React.ReactNode;
}

export function ScreenHeader({ title, chip, meta, children }: ScreenHeaderProps) {
  return (
    /*
      Na počítači je to jeden 48 px pruh; na telefóne sa rozpadne na tri
      riadky pod sebou (nadpis 18 px, pod ním strojopisný doplnok, pod ním
      ovládanie). Návrh to má na oboch šírkach presne takto a je to jediný
      rozumný spôsob, ako sa na 375 px zmestí nadpis aj dve tlačidlá.
    */
    <header className="flex shrink-0 flex-col gap-1.5 border-b border-border px-4 py-3 md:h-12 md:flex-row md:items-center md:gap-3 md:px-5 md:py-0">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg md:text-row">
          {title}
        </h1>

        {chip ? (
          <span className="shrink-0 rounded-[3px] bg-accent-soft px-1.5 py-[3px] font-mono text-micro font-medium tracking-[0.08em] text-accent">
            {chip}
          </span>
        ) : null}
      </div>

      {meta ? (
        <p className="min-w-0 truncate font-mono text-meta tabular-nums text-fg-muted">
          {meta}
        </p>
      ) : null}

      {children ? (
        <div className="flex shrink-0 items-center gap-2 md:ml-auto">{children}</div>
      ) : null}
    </header>
  );
}

export interface ScreenToolbarProps {
  /** Štítok sekcie veľkými písmenami. */
  label: string;
  /** Poznámka hneď za ním — napr. strop dňa. */
  note?: React.ReactNode;
  /**
   * Nápoveda skratiek vpravo.
   *
   * Je `aria-hidden`: kto ju potrebuje počuť, otvorí prehľad klávesou `?`,
   * kde sú skratky aj s vysvetlením. Na telefóne sa nekreslí — klávesnica
   * tam nie je.
   */
  hint?: string;
  children?: React.ReactNode;
}

export function ScreenToolbar({ label, note, hint, children }: ScreenToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-[9px]">
      <span className="shrink-0 font-mono text-micro font-medium uppercase tracking-[0.14em] text-fg-muted">
        {label}
      </span>

      {note ? (
        <span className="min-w-0 truncate font-mono text-mini text-fg-muted">{note}</span>
      ) : null}

      {children}

      {hint ? (
        <span
          aria-hidden="true"
          className="ml-auto hidden shrink-0 font-mono text-mini text-fg-subtle md:block"
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Skratky, ktoré má appka globálne — vypisuje ich pätka každej obrazovky. */
const HINTS = ["? skratky", "n zachytiť", "⌘K paleta"] as const;

export interface ScreenFooterProps {
  /**
   * Jedna veta o stave obrazovky, zarovnaná vpravo.
   *
   * Stavový riadok, nie ovládanie — kliknúť sa naň nedá zámerne.
   */
  summary?: React.ReactNode;
  className?: string;
}

/**
 * Posledných 34 px obrazovky.
 *
 * **Len na počítači.** Na telefóne je dole navigačná lišta a nad ňou plávajúce
 * tlačidlo; štvrtý pruh by z toho spravil chvost, cez ktorý by nebolo vidieť
 * posledné riadky zoznamu.
 */
export function ScreenFooter({ summary, className }: ScreenFooterProps) {
  return (
    <div
      className={cn(
        "hidden h-[34px] shrink-0 items-center gap-3.5 border-t border-border bg-surface px-5",
        "font-mono text-mini text-fg-subtle md:flex",
        className,
      )}
    >
      {HINTS.map((hint) => (
        <span key={hint} aria-hidden="true">
          {hint}
        </span>
      ))}

      {summary ? <p className="ml-auto truncate font-mono tabular-nums">{summary}</p> : null}
    </div>
  );
}

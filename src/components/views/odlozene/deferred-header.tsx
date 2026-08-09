import { Archive, Hourglass } from "lucide-react";

/**
 * Hlavička odkladiska. Nesie jedinú metriku, na ktorej tu záleží — koľko vecí
 * leží bokom — a jednu vetu, čo s tým.
 *
 * Počet dostáva zvonku, aby klesal optimisticky spolu so zoznamom.
 */

/** Ktoré odkladisko hlavička opisuje. */
export type DeferredKind = "someday" | "waiting";

export interface DeferredHeaderProps {
  kind: DeferredKind;
  count: number;
}

/** Slovenské skloňovanie: 1 · 2–4 · 0 a 5+. */
function pluralSk(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  if (count >= 2 && count <= 4) return few;
  return many;
}

interface Copy {
  title: string;
  Icon: typeof Archive;
  /** Prvá veta — mení sa podľa počtu. */
  headline: (count: number) => string;
  /** Druhá veta — hovorí, čo sa s tým má robiť. */
  sentence: (empty: boolean) => string;
}

const COPY: Record<DeferredKind, Copy> = {
  someday: {
    title: "Niekedy",
    Icon: Archive,
    headline: (count) =>
      count === 0
        ? "Nič neleží bokom."
        : `${count} ${pluralSk(count, "odložená vec", "odložené veci", "odložených vecí")}.`,
    sentence: (empty) =>
      empty
        ? "Nič nečaká na neurčito — a to nie je chyba, je to poriadok."
        : "Toto sú veci, ktoré si vedome odložil. Prejdi ich zhora nadol a každej daj deň, alebo ju zahoď. Nič medzi tým.",
  },
  waiting: {
    title: "Čaká sa na",
    Icon: Hourglass,
    headline: (count) =>
      count === 0
        ? "Nečakáš na nikoho."
        : `${count} ${pluralSk(count, "vec čaká", "veci čakajú", "vecí čaká")} na niekoho iného.`,
    sentence: (empty) =>
      empty
        ? "Všetko, čo beží, máš vo vlastných rukách."
        : "Veci, ktoré nevisia na tebe — ale nesmú sa stratiť. Keď sa pohnú, vráť ich sem jedným ťuknutím späť do hry.",
  },
};

export function DeferredHeader({ kind, count }: DeferredHeaderProps) {
  const copy = COPY[kind];
  const Icon = copy.Icon;
  const empty = count === 0;

  return (
    <header className="pb-4">
      <div className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
          {copy.title}
        </h1>
        {empty ? null : (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold tabular-nums text-fg-muted"
          >
            {count}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-fg-muted">
        <span aria-live="polite" className="font-medium text-fg">
          {copy.headline(count)}
        </span>{" "}
        {copy.sentence(empty)}
      </p>
    </header>
  );
}

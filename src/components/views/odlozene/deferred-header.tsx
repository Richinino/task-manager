import { ScreenHeader } from "@/components/shell/screen-chrome";
import { Archive, Hourglass } from "lucide-react";
import { pluralSk } from "@/lib/sk";

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

/** Veta do stavového riadku — tá istá, akou sa odkladisko predstavuje hore. */
export function deferredHeadline(kind: DeferredKind, count: number): string {
  // Bez bodky na konci — v stavovom riadku vedľa skratiek pôsobí ako preklep.
  return COPY[kind].headline(count).replace(/\.$/, "");
}

export function DeferredHeader({ kind, count }: DeferredHeaderProps) {
  const copy = COPY[kind];

  return (
    <ScreenHeader title={copy.title}>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 font-mono text-mini font-semibold tabular-nums text-fg-muted"
        >
          {count}
        </span>
      ) : null}
    </ScreenHeader>
  );
}

/**
 * Veta pod hlavičkou — čo toto odkladisko znamená a čo sa v ňom nedeje.
 *
 * V návrhu má vlastný pruh s linkou. Je to jediné miesto, kde sa dá povedať,
 * že odtiaľto sa nič nepripomína samo — bez toho ľudia očakávajú, že sa im
 * „Niekedy" raz samo ozve, a prestanú appke veriť, keď sa neozve.
 */
export function DeferredIntro({ kind, count }: DeferredHeaderProps) {
  const copy = COPY[kind];
  const empty = count === 0;

  return (
    <p className="shrink-0 border-b border-border px-5 py-[11px] text-pretty text-body leading-normal text-fg-muted">
      <span aria-live="polite" className="font-medium text-fg">
        {copy.headline(count)}
      </span>{" "}
      {copy.sentence(empty)}
    </p>
  );
}

import type { ReactNode } from "react";

/**
 * Pravá lišta obrazovky „Dnes" — kontext dňa, nie práca s ním.
 *
 * Patrí sem to, na čo sa POZERÁŠ, keď sa rozhoduješ: čím je deň obsadený
 * a kam tečie. Nepatrí sem nič, čo sa odškrtáva — zoznam ostáva v hlavnom
 * stĺpci a nesmie mať dve miesta, inak by mal každý riadok dva optimistické
 * stavy a po odškrtnutí by chvíľu svietili opačne.
 *
 * **Existuje len na počítači.** Na telefóne by z nej bol chvost pod zoznamom,
 * ktorý sa nikdy nedoscrolluje. Rozpočet a porady sa tam preto kreslia
 * priamo v hlavnom stĺpci a rozpad podľa oblastí sa nekreslí vôbec — je to
 * súhrn pre pohľad zhora, nie niečo, čo pri odškrtávaní na telefóne treba.
 *
 * Tvar je z návrhu doslova: 280 px, ľavá linka, podklad `surface` a **štyri
 * sekcie oddelené linkami vnútri jednej plochy** — nie karty s medzerami
 * pod sebou. Posledná sekcia dotiahne zvyšok výšky, aby lišta siahala až
 * pod spodok zoznamu.
 */
export interface DayRailProps {
  /** Rozpočet času — prvá sekcia. */
  budget: ReactNode;
  /** Rituály dňa. */
  rituals: ReactNode;
  /** Porady z kalendára. `null`, keď kalendár nič nevrátil. */
  meetings: ReactNode;
  /**
   * Návyky na dnes. `null` mimo dnešného dňa a keď žiadne nie sú —
   * odškrtávať návyk spätne v prehľade dňa je pomýlené.
   */
  habits: ReactNode;
  /** Rozpad dňa podľa oblastí — dotiahne zvyšok výšky. */
  areas: ReactNode;
}

export function DayRail({ budget, rituals, meetings, habits, areas }: DayRailProps) {
  return (
    <aside
      aria-label="Prehľad dňa"
      className="sticky top-0 flex h-dvh w-[280px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface"
    >
      <div className="shrink-0 border-b border-border px-4 py-3.5">{budget}</div>
      <div className="shrink-0 border-b border-border px-4 py-3.5">{rituals}</div>
      {/* Prázdna sekcia by zabrala 29 px odsadenia a nepovedala nič. */}
      {habits ? (
        <div className="shrink-0 border-b border-border px-4 py-3.5">{habits}</div>
      ) : null}

      {meetings ? (
        <div className="shrink-0 border-b border-border px-4 py-3.5">{meetings}</div>
      ) : null}
      <div className="min-h-0 flex-1 px-4 py-3.5">{areas}</div>
    </aside>
  );
}

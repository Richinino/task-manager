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
 * ktorý sa nikdy nedoscrolluje. Porady sa tam preto kreslia priamo v hlavnom
 * stĺpci nad zoznamom a rozpad podľa oblastí sa nekreslí vôbec — je to súhrn
 * pre pohľad zhora, nie niečo, čo na telefóne potrebuješ pri odškrtávaní.
 *
 * Rozpočet času tu nie je zámerne: sedí v hlavičke nad oboma stĺpcami, kde
 * ho vidno na oboch šírkach a nemusí sa kresliť dvakrát.
 */
export function DayRail({ meetings, areas }: { meetings: ReactNode; areas: ReactNode }) {
  return (
    <aside aria-label="Prehľad dňa" className="flex w-[280px] shrink-0 flex-col gap-5">
      {meetings}
      {areas}
    </aside>
  );
}

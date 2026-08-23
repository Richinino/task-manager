import { taskCountSk } from "@/components/views/dnes/time-budget";

/**
 * Pásik pod zoznamom — skratky vľavo, súhrn dňa vpravo.
 *
 * V návrhu („Dnes · počítač") je to posledných 34 px obrazovky: tri skratky
 * v strojopise a na druhej strane jedna veta o tom, ako deň stojí. Nie je to
 * ovládanie, je to stavový riadok — preto sa naň nedá kliknúť.
 *
 * **Len na počítači.** Na telefóne je dole navigačná lišta a nad ňou
 * plávajúce tlačidlo; štvrtý pruh by z toho spravil chvost, cez ktorý by
 * nebolo vidieť posledné riadky zoznamu.
 */
export interface DayFooterProps {
  openCount: number;
  doneCount: number;
  overdueCount: number;
}

export function DayFooter({ openCount, doneCount, overdueCount }: DayFooterProps) {
  const casti = [
    `${taskCountSk(openCount)} otvorených`,
    doneCount === 1 ? "1 hotová" : `${doneCount} hotových`,
    overdueCount > 0 ? `${overdueCount} po termíne` : null,
  ].filter((cast): cast is string => cast !== null);

  return (
    <div className="hidden h-[34px] shrink-0 items-center gap-3.5 border-t border-border bg-surface px-5 font-mono text-mini text-fg-subtle md:flex">
      {/*
        Skratky sú dekorácia pre oko — kto ich potrebuje počuť, otvorí si
        prehľad klávesou `?`, kde sú aj s vysvetlením.
      */}
      <span aria-hidden="true">? skratky</span>
      <span aria-hidden="true">n zachytiť</span>
      <span aria-hidden="true">⌘K paleta</span>

      <p className="ml-auto font-mono tabular-nums">{casti.join(" · ")}</p>
    </div>
  );
}

import { ScreenHeader } from "@/components/shell/screen-chrome";

/**
 * Hlavička obrazovky šablón.
 *
 * Jedna vec musí byť jasná skôr, než sa niečo založí: **šablóna nie je záloha
 * úloh.** Kto sem príde s očakávaním „ulož mi tento týždeň a vráť mi ho",
 * bude prekvapený, že zmena pôvodnej úlohy sa v šablóne neprejaví — a naopak,
 * kto si myslí, že zmazaním úlohy sa mu rozpadne rutina, si šablónu nikdy
 * nezaloží.
 *
 * Šablóna je PREDPIS: samostatný popis toho, čo má vzniknúť. Práve preto ju
 * nič mimo nej nevie pokaziť.
 */
export interface TemplatesHeaderProps {
  templateCount: number;
}

export function TemplatesHeader({ templateCount }: TemplatesHeaderProps) {
  return (
    <ScreenHeader title="Šablóny">
      {templateCount > 0 ? (
        <span
          aria-hidden="true"
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 font-mono text-mini font-semibold tabular-nums text-fg-muted"
        >
          {templateCount}
        </span>
      ) : null}
    </ScreenHeader>
  );
}

/**
 * Veta pod hlavičkou. V návrhu je to samostatný pruh s vlastnou linkou —
 * vysvetľuje, čím sa táto obrazovka líši od tých vedľa nej.
 */
export function TemplatesIntro() {
  return (
    <p className="shrink-0 border-b border-border px-5 py-[11px] text-pretty text-body leading-normal text-fg-muted">
        Šablóna je{" "}
        <span className="font-medium text-fg">predpis, nie kópia úloh</span> —
        samostatný zoznam definícií, ktorý sa nerozbije tým, že niektorú
        z pôvodných úloh zmažeš. Dni sú v nej relatívne, takže „Ranná rutina“ aj
        „Príprava na dovolenku“ sa dajú použiť kedykoľvek: deň si vyberieš pri
        použití a zvyšok sa dopočíta od neho.
    </p>
  );
}

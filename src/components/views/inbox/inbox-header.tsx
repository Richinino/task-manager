

/**
 * Hlavička inboxu. Nesie jedinú metriku, na ktorej tu záleží — koľko vecí
 * ešte čaká na rozhodnutie — a jednu vetu, čo s tým.
 *
 * Veta je zámerne krátka a v rozkazovacom spôsobe („rozhodni a choď ďalej").
 * Inbox nie je zoznam na čítanie, ale fronta na vyprázdnenie; dlhší popis by
 * človeka zdržal presne na mieste, kde má konať.
 *
 * Počet dostáva zvonku, aby klesal optimisticky spolu so zoznamom.
 */
export interface InboxHeaderProps {
  count: number;
}

/** Slovenské skloňovanie: 1 vec · 2–4 veci · 0 a 5+ vecí. */
function countLabel(count: number): string {
  if (count === 1) return "1 nezatriedená vec";
  if (count >= 2 && count <= 4) return `${count} nezatriedené veci`;
  return `${count} nezatriedených vecí`;
}

export function InboxHeader({ count }: InboxHeaderProps) {
  const empty = count === 0;

  return (
    /*
      V návrhu je hlavička 48 px pásik so spodnou linkou: názov, počet
      a napravo tichá pripomienka pravidla. Dlhšia veta ostáva len pre
      prázdny inbox — vtedy je to jediné, čo na obrazovke je.
    */
    <header className="flex h-12 items-center gap-3 border-b border-border px-4 sm:px-5">
      <h1 className="shrink-0 text-row font-semibold tracking-tight text-fg">Inbox</h1>

      <p aria-live="polite" className="min-w-0 truncate font-mono text-meta text-fg-muted">
        {empty ? "na nule" : `${countLabel(count)}`}
      </p>

      <p className="ml-auto hidden shrink-0 font-mono text-mini text-fg-subtle lg:block">
        {empty
          ? "Nič nečaká na rozhodnutie — presne tak to má vyzerať."
          : "1 vec naraz — rozhodni a choď ďalej"}
      </p>
    </header>
  );
}

import { Inbox } from "lucide-react";

/**
 * Hlavička inboxu. Nesie jedinú metriku, na ktorej tu záleží — koľko vecí
 * ešte čaká na rozhodnutie — a jednu vetu, čo s tým.
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
  const headline = empty ? "Inbox je na nule." : `${countLabel(count)}.`;
  const sentence = empty
    ? "Nič nečaká na rozhodnutie — presne tak to má vyzerať."
    : "Choď zhora nadol a každej daj deň, projekt alebo ju rovno zahoď. Cieľ je nula.";

  return (
    <header className="pb-4">
      <div className="flex items-center gap-2">
        <Inbox aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
        <h1 className="text-lg font-semibold tracking-tight text-fg">Inbox</h1>
        {empty ? null : (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold tabular-nums text-fg-muted"
          >
            {count}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-fg-muted">
        <span aria-live="polite" className="font-medium text-fg">
          {headline}
        </span>{" "}
        {sentence}
      </p>
    </header>
  );
}

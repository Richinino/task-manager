import { Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";

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
    <header className="pb-4">
      <div className="flex min-w-0 items-center gap-2">
        <Inbox aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
          Inbox
        </h1>
        {empty ? null : (
          <Badge aria-hidden="true" tone="neutral" className="shrink-0">
            {count}
          </Badge>
        )}
      </div>

      <p className="mt-1 text-sm text-fg-muted">
        <span aria-live="polite" className="font-medium text-fg">
          {empty ? "Inbox je na nule." : `${countLabel(count)}.`}
        </span>{" "}
        {empty
          ? "Nič nečaká na rozhodnutie — presne tak to má vyzerať."
          : "Jedna vec naraz — rozhodni a choď ďalej. Cieľ je nula."}
      </p>
    </header>
  );
}

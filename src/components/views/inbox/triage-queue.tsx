import { cn } from "@/lib/utils";

/**
 * Fronta vpravo — koľko toho ešte je.
 *
 * V návrhu („Inbox · počítač") je to 300 px panel s očíslovaným zoznamom
 * a pod ním veta o tom, čo bude, keď sa minie. Práve to je celý zmysel
 * obrazovky: vidieť, že fronta má koniec.
 *
 * Nie sú to tlačidlá. Triedi sa jedna vec naraz a preskakuje sa klávesou —
 * keby sa dalo skočiť kamkoľvek, obrazovka by sa vrátila k zoznamu, ktorým
 * pôvodne bola.
 */
export interface TriageQueueProps {
  items: readonly { id: string; title: string }[];
  /** Index práve triedenej položky. */
  activeIndex: number;
}

export function TriageQueue({ items, activeIndex }: TriageQueueProps) {
  return (
    <aside
      aria-label="Fronta inboxu"
      className="hidden w-[300px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface lg:flex"
    >
      <p className="label shrink-0 border-b border-border px-4 py-3.5 text-fg-subtle">
        Fronta
      </p>

      <ol className="flex shrink-0 flex-col">
        {items.map((item, index) => {
          const aktivna = index === activeIndex;
          return (
            <li
              key={item.id}
              aria-current={aktivna ? "true" : undefined}
              className={cn(
                "flex items-center gap-2.5 border-b border-border px-4 py-3",
                aktivna && "border-l-[3px] border-l-accent bg-accent-soft",
              )}
            >
              <span
                className={cn(
                  "w-3.5 shrink-0 font-mono text-mini tabular-nums",
                  aktivna ? "text-accent" : "text-fg-subtle",
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  aktivna ? "font-medium text-fg" : "text-fg-muted",
                )}
              >
                {item.title}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <span aria-hidden="true" className="text-2xl text-fg-subtle">
          ◌
        </span>
        <p className="text-body leading-relaxed text-fg-muted">
          {items.length === 1
            ? "Po zatriedení tejto jednej je inbox prázdny. To je celý cieľ obrazovky."
            : `Po zatriedení týchto ${items.length} je inbox prázdny. To je celý cieľ obrazovky.`}
        </p>
      </div>
    </aside>
  );
}

import { Layers } from "lucide-react";

/**
 * Hlavička obrazovky oblastí.
 *
 * Rovnako ako pri projektoch je tu jedna veta, ktorá musí byť jasná skôr,
 * než človek niečo založí — len z opačnej strany: oblasť sa nikdy nezavrie.
 * Kto si sem napíše „Presťahovať sa", bude čakať na deň, keď oblasť zmizne
 * zo zoznamu, a ten deň nepríde.
 */
export interface AreasHeaderProps {
  activeCount: number;
}

export function AreasHeader({ activeCount }: AreasHeaderProps) {
  return (
    <header>
      <div className="flex min-w-0 items-center gap-2">
        <Layers aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
          Oblasti
        </h1>
        {activeCount > 0 ? (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 text-mini font-semibold font-mono tabular-nums text-fg-muted"
          >
            {activeCount}
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-fg-muted">
        Oblasť je okruh života, ktorý sa len udržiava a{" "}
        <span className="font-medium text-fg">nikdy nekončí</span> — zdravie,
        financie, domácnosť, práca. Nemá cieľ ani termín; keby ho mala, je to
        projekt. Farba oblasti sa objaví ako bodka pri každej úlohe, ktorá do nej
        patrí.
      </p>
    </header>
  );
}

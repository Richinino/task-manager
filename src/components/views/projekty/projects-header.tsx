import { FolderKanban } from "lucide-react";

/**
 * Hlavička obrazovky projektov.
 *
 * Nesie jedinú vetu, ktorá musí byť jasná skôr, než človek niečo založí:
 * čím sa projekt líši od oblasti. Bez toho vzniknú „projekty" ako Zdravie
 * alebo Domácnosť, ktoré sa nikdy nedajú zavrieť, a zoznam projektov
 * prestane znamenať „toto ešte nie je dokončené".
 *
 * Počet je tu len ako tichá metrika — o zozname rozhoduje samotný zoznam.
 */
export interface ProjectsHeaderProps {
  activeCount: number;
}

/** Slovenské skloňovanie: 1 projekt · 2–4 projekty · 0 a 5+ projektov. */
export function projectCountLabel(count: number): string {
  if (count === 1) return "1 projekt";
  if (count >= 2 && count <= 4) return `${count} projekty`;
  return `${count} projektov`;
}

export function ProjectsHeader({ activeCount }: ProjectsHeaderProps) {
  return (
    <header>
      <div className="flex min-w-0 items-center gap-2">
        <FolderKanban aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
          Projekty
        </h1>
        {activeCount > 0 ? (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 text-mini font-semibold tabular-nums text-fg-muted"
          >
            {activeCount}
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-fg-muted">
        Projekt je zoskupenie úloh, ktoré majú spoločný cieľ a{" "}
        <span className="font-medium text-fg">koniec</span>. Keď je cieľ splnený,
        projekt sa zavrie — tým sa líši od oblasti, ktorá sa len udržiava a nikdy
        nekončí.
      </p>
    </header>
  );
}

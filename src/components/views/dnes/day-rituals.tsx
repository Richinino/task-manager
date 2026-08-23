import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Rituály v pravej lište — stav, nie ovládanie.
 *
 * V návrhu („Dnes · počítač", sekcia RITUÁLY) sú dva riadky: odškrtnutý
 * ranný a čakajúci večerný, každý s hodinou vpravo. Spúšťajú sa z hlavičky,
 * kde je na to tlačidlo; tu je len vidieť, čo z dňa už prebehlo.
 *
 * Preto sú to `<div>`, nie tlačidlá: dve miesta, ktoré ten istý rituál
 * otvárajú, by znamenali dva optimistické stavy jednej veci.
 */
export interface DayRitualsProps {
  /** Ranné plánovanie je za nami. */
  morningDone: boolean;
  /** Večerný shutdown je za nami. */
  shutdownDone: boolean;
  /** Hodina začiatku dňa z nastavení (0–23). */
  dayStartHour: number;
  /** Hodina konca dňa z nastavení (0–23). */
  dayEndHour: number;
}

/** „8" → „8:00". Rituály sa viažu na celú hodinu z nastavení. */
function hodina(h: number): string {
  return `${h}:00`;
}

interface RiadokProps {
  nazov: string;
  done: boolean;
  cas: string;
}

function Riadok({ nazov, done, cas }: RiadokProps) {
  return (
    <div className="flex items-center gap-2.5 text-body">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm",
          done
            ? "bg-success text-white"
            : "border-[1.5px] border-border-strong",
        )}
      >
        {done ? <Check size={10} strokeWidth={3} /> : null}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          done ? "text-fg-muted line-through" : "font-medium text-fg",
        )}
      >
        {nazov}
        <span className="sr-only">{done ? " — hotové" : " — čaká"}</span>
      </span>
      <span className="shrink-0 font-mono text-mini text-fg-muted tabular-nums">{cas}</span>
    </div>
  );
}

export function DayRituals({
  morningDone,
  shutdownDone,
  dayStartHour,
  dayEndHour,
}: DayRitualsProps) {
  return (
    <section aria-labelledby="dnes-ritualy" className="flex flex-col gap-2">
      <h2 id="dnes-ritualy" className="label text-fg-subtle">
        Rituály
      </h2>
      <Riadok nazov="Ranné plánovanie" done={morningDone} cas={hodina(dayStartHour)} />
      <Riadok nazov="Večerný shutdown" done={shutdownDone} cas={hodina(dayEndHour)} />
    </section>
  );
}

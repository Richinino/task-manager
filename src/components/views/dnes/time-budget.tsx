import { formatDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Slovenské skloňovanie počtu úloh: 1 úloha · 2–4 úlohy · 5+ úloh.
 *
 * Žije tu, lebo rozpočet času je jediné miesto, kde sa počet úloh naozaj
 * vypisuje slovom („3 úlohy bez odhadu"). Zdieľa ho ešte upozornenie na WIP
 * limit — vlastný modul v `src/lib` by pre štyri riadky bol zbytočný.
 */
export function taskCountSk(count: number): string {
  const n = Math.abs(Math.trunc(count));
  if (n === 1) return "1 úloha";
  if (n >= 2 && n <= 4) return `${n} úlohy`;
  return `${n} úloh`;
}

export interface TimeBudgetProps {
  /** Súčet odhadov dnešných nedokončených úloh, v minútach. */
  plannedMin: number;
  /** Dostupný čas dňa z nastavení (dayEndHour − dayStartHour), v minútach. */
  availableMin: number;
  /** Koľko dnešných nedokončených úloh nemá odhad — číslo je o ne neúplné. */
  withoutEstimate: number;
}

/**
 * Rozpočet času dňa. Tenký pruh a jedna veta — nič viac.
 *
 * Pri prekročení sa pruh aj text prefarbia na `text-danger` a pribudne veta
 * s rozdielom. Úlohy bez odhadu sa priznávajú zvlášť, aby bolo jasné,
 * že súčet je spodný odhad, nie celá pravda.
 */
export function TimeBudget({
  plannedMin,
  availableMin,
  withoutEstimate,
}: TimeBudgetProps) {
  const missing = withoutEstimate > 0 ? `${taskCountSk(withoutEstimate)} bez odhadu` : null;

  // Hodiny dňa sa dajú nastaviť tak, že z nich nič nezostane (koniec ≤ začiatok).
  // Vtedy nemá zmysel kresliť pruh — povieme rovno, čo treba opraviť.
  if (availableMin <= 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-fg-muted">
          Naplánovaných{" "}
          <span className="tabular-nums">{formatDuration(plannedMin)}</span>. Rozpočet
          času sa nedá spočítať — hodiny dňa v nastaveniach nedávajú žiadny čas.
        </p>
        {missing ? <p className="text-xs text-fg-subtle">{missing}.</p> : null}
      </div>
    );
  }

  const over = plannedMin > availableMin;
  const overBy = plannedMin - availableMin;
  const fill = Math.min(100, Math.round((plannedMin / availableMin) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      {/* Pruh je len obraz vety pod ním — pre čítačky ho neopakujeme. */}
      <div
        aria-hidden="true"
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          style={{ width: `${fill}%` }}
          className={cn("h-full rounded-full", over ? "bg-danger" : "bg-accent")}
        />
      </div>

      <p className={cn("text-xs leading-relaxed", over ? "text-danger" : "text-fg-muted")}>
        <span className="tabular-nums">{formatDuration(plannedMin)}</span> naplánovaných
        z <span className="tabular-nums">{formatDuration(availableMin)}</span>
        {over ? ` — naplánoval si o ${formatDuration(overBy)} viac, než máš.` : "."}
      </p>

      {missing ? (
        <p className="text-xs text-fg-subtle">
          {missing} — skutočný čas bude vyšší.
        </p>
      ) : null}
    </div>
  );
}

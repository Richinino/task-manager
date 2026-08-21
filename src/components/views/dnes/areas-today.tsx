import { AreaDot } from "@/components/task/area-dot";
import { shortDuration, summarizeAreas } from "@/lib/area-summary";
import type { TaskWithRelations } from "@/server/queries/tasks";

/**
 * Kam dnes tečie deň — rozpad dnešných úloh podľa oblastí.
 *
 * Rozpočet času hovorí KOĽKO, toto hovorí NA ČO. Zmysel je v tom, že päť
 * úloh na jednu oblasť vyzerá v zozname rovnako ako päť úloh po oblastiach,
 * ale je to úplne iný deň — a všimne si to len ten, kto to vidí vedľa seba.
 *
 * Počíta sa z úloh, ktoré obrazovka aj tak má; vlastný dopyt na to netreba.
 */
export interface AreasTodayProps {
  /** Dnešné úlohy bez zahodených — také isté, aké kreslí zoznam. */
  tasks: readonly TaskWithRelations[];
}

export function AreasToday({ tasks }: AreasTodayProps) {
  const { areas, unassigned } = summarizeAreas(tasks);
  // Bez oblastí by tu ostal nadpis nad prázdnom — vtedy sekcia radšej zmizne.
  if (areas.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="label text-fg-subtle">Oblasti dnes</h2>

      <ul className="flex flex-col gap-1.5">
        {areas.map((area) => (
          <li key={area.id} className="flex items-center gap-2 text-body">
            <AreaDot color={area.color} name={area.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-fg">{area.name}</span>
            <span className="shrink-0 font-mono text-mini tabular-nums text-fg-muted">
              {area.count} ·{" "}
              {area.minutes === 0 && area.withoutEstimate > 0
                ? "—"
                : shortDuration(area.minutes)}
              {area.minutes > 0 && area.withoutEstimate > 0 ? "+" : null}
            </span>
          </li>
        ))}

        {/*
          Úlohy bez oblasti sa nepočítajú medzi ne, ale ani nesmú ticho
          zmiznúť — inak by súčet nesedel s dĺžkou zoznamu a človek by hľadal,
          kde sa stratili.
        */}
        {unassigned > 0 ? (
          <li className="flex items-center gap-2 text-body text-fg-subtle">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full border border-border-strong" />
            <span className="min-w-0 flex-1 truncate">bez oblasti</span>
            <span className="shrink-0 font-mono text-mini tabular-nums">{unassigned}</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

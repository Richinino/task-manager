import { Flag } from "lucide-react";

import type { Area } from "@/db/schema";
import { formatRelativeSk, isPast, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectWithCounts } from "@/server/queries/structure";

/**
 * Pravá lišta obrazovky projektov.
 *
 * Odpovedá na dve otázky, ktoré zo zoznamu prečítať nejde: **kde mám projekty
 * nahustené** a **čo horí najbližšie**. Zoznam je zoradený podľa vlastného
 * poradia, takže termíny v ňom ležia rozsypané — tu sú tri najbližšie pod sebou.
 *
 * Pod `lg` sa nekreslí vôbec. Na telefóne by to bol tretí blok, cez ktorý sa
 * treba prerolovať k samotným projektom, a obe čísla sú aj v riadkoch zoznamu.
 */
export interface ProjectsRailProps {
  /** Živé projekty — archivované sa do prehľadu nerátajú. */
  active: readonly ProjectWithCounts[];
  areas: readonly Area[];
  /** Dnešok z pásma používateľa. */
  todayIso: string;
}

/** Koľko termínov ukázať. Štvrtý už nie je „najbližší". */
const MAX_DEADLINES = 4;

interface AreaRow {
  id: string | null;
  name: string;
  color: string | null;
  projects: number;
  openTasks: number;
}

/**
 * Projekty poskladané po oblastiach.
 *
 * Oblasti bez jediného projektu vypadnú — prázdny riadok v prehľade je šum.
 * „Bez oblasti" naopak ostáva vždy, keď tam niečo je: je to jediné miesto,
 * kde sa dá všimnúť, že projekt nikam nepatrí.
 */
function groupByArea(
  active: readonly ProjectWithCounts[],
  areas: readonly Area[],
): AreaRow[] {
  const rows = new Map<string, AreaRow>();

  for (const area of areas) {
    rows.set(area.id, {
      id: area.id,
      name: area.name,
      color: area.color,
      projects: 0,
      openTasks: 0,
    });
  }

  const bezOblasti: AreaRow = {
    id: null,
    name: "bez oblasti",
    color: null,
    projects: 0,
    openTasks: 0,
  };

  for (const project of active) {
    const row = project.area === null ? bezOblasti : rows.get(project.area.id);
    if (row === undefined) continue;
    row.projects += 1;
    row.openTasks += project.openTaskCount;
  }

  const out = [...rows.values()].filter((row) => row.projects > 0);
  if (bezOblasti.projects > 0) out.push(bezOblasti);
  return out;
}

export function ProjectsRail({ active, areas, todayIso }: ProjectsRailProps) {
  const now = parseIsoDate(todayIso);
  const rows = groupByArea(active, areas);

  const deadlines = active
    .filter((project): project is ProjectWithCounts & { deadline: string } =>
      project.deadline !== null,
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, MAX_DEADLINES);

  return (
    <aside
      aria-label="Prehľad projektov"
      className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface lg:flex"
    >
      {rows.length > 0 ? (
        <>
          <h2 className="label shrink-0 border-b border-border px-4 py-3.5 text-fg-subtle">
            Podľa oblasti
          </h2>

          <ul className="shrink-0">
            {rows.map((row) => (
              <li
                key={row.id ?? "bez-oblasti"}
                className="flex items-center gap-2 border-b border-border px-4 py-[9px]"
              >
                <span
                  aria-hidden="true"
                  className="size-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: row.color ?? "var(--fg-subtle)" }}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-body",
                    row.id === null ? "text-fg-muted" : "text-fg",
                  )}
                >
                  {row.name}
                </span>
                {/*
                  Dve čísla bez menoviek by boli hádanka, preto ich `title`
                  aj `aria-label` pomenujú. Oku stačí, že sú to dva stĺpce
                  rovnako široké naprieč riadkami.
                */}
                <span
                  title={`${row.projects} projektov · ${row.openTasks} nevybavených úloh`}
                  aria-label={`${row.projects} projektov, ${row.openTasks} nevybavených úloh`}
                  className="shrink-0 font-mono text-mini tabular-nums text-fg-muted"
                >
                  {row.projects} · {row.openTasks}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {deadlines.length > 0 ? (
        <>
          <h2 className="label shrink-0 px-4 pb-2.5 pt-3.5 text-fg-subtle">
            Najbližšie termíny
          </h2>

          <ul className="flex shrink-0 flex-col gap-2 px-4 pb-3.5 font-mono text-mini">
            {deadlines.map((project) => {
              const overdue = isPast(project.deadline, now);
              return (
                <li key={project.id} className="flex gap-2">
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 font-mono tabular-nums",
                      overdue ? "font-medium text-danger" : "text-fg-muted",
                    )}
                  >
                    <Flag aria-hidden="true" size={10} className="shrink-0" />
                    {formatRelativeSk(project.deadline, now)}
                  </span>
                  <span className="min-w-0 truncate text-fg-muted">{project.name}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <div className="flex-1" />

      <p className="shrink-0 border-t border-border px-4 py-3 text-pretty text-meta leading-normal text-fg-subtle">
        Archivovaný projekt sa neponúka vo výberoch, ale jeho úlohy aj história
        ostávajú.
      </p>
    </aside>
  );
}

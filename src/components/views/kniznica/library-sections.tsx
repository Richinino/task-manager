import type { Route } from "next";
import Link from "next/link";
import {
  Archive,
  ChevronRight,
  GraduationCap,
  Hourglass,
  Layers,
  LayoutTemplate,
  Lightbulb,
  Repeat,
  Search,
  Sprout,
  type LucideIcon,
} from "lucide-react";

import { areaColorValue } from "@/components/task/area-dot";
import { formatDayMonthSk } from "@/lib/dates";
import { countSk } from "@/lib/sk";
import type { ProjectWithCounts } from "@/server/queries/structure";

/* ── Projekty: vodorovný pás kariet ───────────────────────────────────── */

export function LibraryProjects({ projects }: { projects: ProjectWithCounts[] }) {
  return (
    <section aria-labelledby="kniznica-projekty" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between px-4">
        <h2 id="kniznica-projekty" className="text-row font-semibold text-fg">
          Projekty
        </h2>
        <Link href="/projekty" className="py-3 text-meta font-medium text-fg-muted">
          Všetky
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="px-4 text-body text-fg-muted">
          Zatiaľ žiadny projekt — založ prvý v{" "}
          <Link href="/projekty" className="font-medium text-fg underline">
            Projektoch
          </Link>
          .
        </p>
      ) : (
        <ul className="-mt-2 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {projects.map((project) => {
            const total = project.openTaskCount + project.doneTaskCount;
            const pct = total === 0 ? 0 : Math.round((project.doneTaskCount / total) * 100);
            const due = project.deadline ?? project.nextDueDate;

            return (
              <li key={project.id} className="shrink-0">
                <Link
                  href={`/projekty/${project.id}` as Route}
                  style={{
                    backgroundColor: project.area
                      ? areaColorValue(project.area.color)
                      : "var(--fg-muted)",
                  }}
                  className="flex h-[120px] w-[150px] flex-col justify-between rounded-xl p-3 text-white"
                >
                  <span className="font-display line-clamp-2 text-row leading-tight">
                    {project.name}
                  </span>
                  <span className="flex flex-col gap-1.5">
                    <span className="flex items-baseline justify-between text-meta font-medium font-mono tabular-nums">
                      <span>
                        {project.doneTaskCount}/{total}
                      </span>
                      {due ? <span>do {formatDayMonthSk(due)}</span> : null}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-1 overflow-hidden rounded-full bg-white/30"
                    >
                      <span
                        className="block h-full rounded-full bg-white"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Dlaždice Oblasti / Návyky / Učenie ───────────────────────────────── */

export interface LibraryTilesProps {
  areas: { id: string; color: string }[];
  habitCount: number;
  pillarCount: number;
}

const TILE =
  "flex min-h-[88px] flex-col justify-between rounded-xl border border-border bg-surface p-3 active:bg-surface-2";

export function LibraryTiles({ areas, habitCount, pillarCount }: LibraryTilesProps) {
  return (
    <ul className="grid grid-cols-3 gap-2.5 px-4">
      <li>
        <Link href="/oblasti" className={TILE}>
          <Layers aria-hidden="true" className="size-[18px] text-fg-subtle" />
          <span className="flex flex-col gap-1">
            <span className="text-row font-semibold text-fg">Oblasti</span>
            <span className="flex items-center gap-1 text-meta text-fg-muted font-mono tabular-nums">
              {areas.length}
              <span aria-hidden="true" className="ml-1 flex gap-0.5">
                {areas.slice(0, 5).map((area) => (
                  <span
                    key={area.id}
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: areaColorValue(area.color) }}
                  />
                ))}
              </span>
            </span>
          </span>
        </Link>
      </li>
      <li>
        <Link href="/navyky" className={TILE}>
          <Sprout aria-hidden="true" className="size-[18px] text-fg-subtle" />
          <span className="flex flex-col gap-1">
            <span className="text-row font-semibold text-fg">Návyky</span>
            <span className="text-meta text-fg-muted font-mono tabular-nums">{habitCount}</span>
          </span>
        </Link>
      </li>
      <li>
        <Link href="/ucenie" className={TILE}>
          <GraduationCap aria-hidden="true" className="size-[18px] text-fg-subtle" />
          <span className="flex flex-col gap-1">
            <span className="text-row font-semibold text-fg">Učenie</span>
            <span className="text-meta text-fg-muted font-mono tabular-nums">
              {countSk(pillarCount, "pilier", "piliere", "pilierov")}
            </span>
          </span>
        </Link>
      </li>
    </ul>
  );
}

/* ── Zoznam odkladísk ─────────────────────────────────────────────────── */

interface LibraryRow {
  href: Route;
  label: string;
  Icon: LucideIcon;
  count?: number;
}

export function LibraryList({
  somedayCount,
  waitingCount,
}: {
  somedayCount: number;
  waitingCount: number;
}) {
  const rows: LibraryRow[] = [
    { href: "/napady", label: "Nápady", Icon: Lightbulb },
    { href: "/niekedy", label: "Niekedy", Icon: Archive, count: somedayCount },
    { href: "/caka-sa-na", label: "Čaká sa na", Icon: Hourglass, count: waitingCount },
    { href: "/opakovane", label: "Opakované", Icon: Repeat },
    { href: "/sablony", label: "Šablóny", Icon: LayoutTemplate },
    { href: "/archiv", label: "Archív", Icon: Search },
  ];

  return (
    <ul className="mx-4 overflow-hidden rounded-xl border border-border bg-surface">
      {rows.map(({ href, label, Icon, count }) => (
        <li key={href} className="border-b border-border last:border-b-0">
          <Link
            href={href}
            className="flex h-12 items-center gap-3 px-3.5 text-row text-fg active:bg-surface-2"
          >
            <Icon aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count !== undefined ? (
              <span className="text-meta text-fg-muted font-mono tabular-nums">{count}</span>
            ) : null}
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

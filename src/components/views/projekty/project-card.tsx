import Link from "next/link";
import { Archive, CalendarClock, Flag } from "lucide-react";

import { AreaDot } from "@/components/task/area-dot";
import { formatRelativeSk, isPast, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectWithCounts } from "@/server/queries/structure";

/**
 * Karta projektu v zozname.
 *
 * Odpovedá na tri otázky, kvôli ktorým sa človek na zoznam pozerá:
 * koľko toho ešte ostáva, ako ďaleko to je a či niečo horí. Preto je
 * postup číslom aj pásikom — číslo je presné, pásik sa dá prebehnúť očami.
 *
 * Je to obyčajný odkaz bez vlastného stavu, takže ho vie vykresliť server
 * aj klientský zoznam. Vnútri zámerne nie sú žiadne ďalšie tlačidlá:
 * vnorený interaktívny prvok v odkaze je pasca pre klávesnicu aj čítačku,
 * a všetky akcie projektu majú svoje miesto v jeho detaile.
 */
export interface ProjectCardProps {
  project: ProjectWithCounts;
  /** Dnešok z pásma používateľa — klient si ho nikdy nepočíta sám. */
  todayIso: string;
  className?: string;
}

/** Slovenské skloňovanie: 1 úloha · 2–4 úlohy · 0 a 5+ úloh. */
export function taskCountLabel(count: number): string {
  if (count === 1) return "1 úloha";
  if (count >= 2 && count <= 4) return `${count} úlohy`;
  return `${count} úloh`;
}

export function ProjectCard({ project, todayIso, className }: ProjectCardProps) {
  // Lokálna polnoc dneška zo servera; „dnes"/„zajtra" sa po hydratácii nesmie zmeniť.
  const now = parseIsoDate(todayIso);

  const total = project.openTaskCount + project.doneTaskCount;
  const percent = total === 0 ? 0 : Math.round((project.doneTaskCount / total) * 100);
  const archived = project.archivedAt !== null;

  const deadline = project.deadline;
  const deadlineOverdue = deadline !== null && !archived && isPast(deadline, now);
  const nextDue = project.nextDueDate;
  const nextDueOverdue = nextDue !== null && !archived && isPast(nextDue, now);

  /* Zhrnutie pre čítačku — farba ani pásik nie sú jediným nosičom informácie. */
  const summary = [
    `Projekt ${project.name}`,
    archived ? "archivovaný" : null,
    project.area ? `oblasť ${project.area.name}` : "bez oblasti",
    `${taskCountLabel(project.openTaskCount)} nevybavených`,
    total > 0 ? `hotové ${project.doneTaskCount} z ${total}` : "zatiaľ bez úloh",
    deadline !== null
      ? `termín projektu ${formatRelativeSk(deadline, now)}${deadlineOverdue ? ", po termíne" : ""}`
      : null,
    nextDue !== null
      ? `najbližší termín úlohy ${formatRelativeSk(nextDue, now)}${nextDueOverdue ? ", po termíne" : ""}`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");

  return (
    <Link
      href={`/projekty/${project.id}`}
      aria-label={summary}
      className={cn(
        /*
          Návrh („Projekty") kreslí pruh cez celú šírku so spodnou linkou, nie
          kartičku. Zoznam projektov je tak jedna súvislá plocha a meno
          projektu má celú šírku okna namiesto šírky karty.
        */
        "flex min-w-0 flex-col gap-[7px] border-b border-border bg-surface px-5 pb-[13px] pt-3",
        "transition-colors duration-100 ease-out hover:bg-surface-2",
        archived && "opacity-70",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {archived ? (
          <Archive aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {project.name}
        </span>
        {/* Počet nevybavených je to jediné číslo, ktoré musí byť vidieť
            na akejkoľvek šírke — preto je v hlavičke karty, nie v meta riadku. */}
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5",
            "font-mono text-mini font-semibold tabular-nums",
            project.openTaskCount === 0
              ? "bg-surface-2 text-fg-subtle"
              : "bg-accent-badge text-fg",
          )}
        >
          {project.openTaskCount}
        </span>
      </div>

      {/*
        Meta riadok sa zalamuje: na 375 px sa oblasť, postup a dva termíny
        vedľa seba nezmestia a `flex-wrap` je jediné, čo tam nepretečie.
      */}
      <div
        aria-hidden="true"
        className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-mini text-fg-muted"
      >
        {project.area ? (
          <AreaDot
            color={project.area.color}
            name={project.area.name}
            className="max-w-40 min-w-0 shrink"
          />
        ) : (
          <span className="text-fg-subtle">bez oblasti</span>
        )}

        <span className="shrink-0 whitespace-nowrap">
          {total === 0 ? "zatiaľ bez úloh" : `hotové ${project.doneTaskCount} z ${total}`}
        </span>

        {/* Dve rôzne veci, ktoré sa dajú ľahko zameniť, preto majú vlastnú
            ikonu aj vysvetlenie pod myšou: zástavka je termín celého projektu,
            hodiny sú najbližší termín spomedzi jeho úloh. */}
        {deadline !== null ? (
          <span
            title={`termín projektu ${formatRelativeSk(deadline, now)}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
              deadlineOverdue && "font-medium text-danger",
            )}
          >
            <Flag size={12} className="shrink-0" />
            {formatRelativeSk(deadline, now)}
          </span>
        ) : null}

        {nextDue !== null ? (
          <span
            title={`najbližší termín úlohy ${formatRelativeSk(nextDue, now)}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
              nextDueOverdue && "font-medium text-danger",
            )}
          >
            <CalendarClock size={12} className="shrink-0" />
            do {formatRelativeSk(nextDue, now)}
          </span>
        ) : null}
      </div>

      {total > 0 ? (
        <span
          aria-hidden="true"
          className="block h-[3px] w-full overflow-hidden rounded-[2px] bg-surface-2"
        >
          <span
            className="block h-full bg-accent transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </span>
      ) : null}
    </Link>
  );
}

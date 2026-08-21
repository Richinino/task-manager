"use client";

import { useId, useState } from "react";
import { CalendarPlus, ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";

import { EnergyBadge } from "@/components/task/energy-badge";
import { PriorityDot } from "@/components/task/priority-dot";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TemplateSummary } from "@/server/queries/templates";

import { dayOffsetShort, taskCountLabel } from "./template-labels";

/* ═══════════════════════════════════════════════════════════════════════════
   KARTA ŠABLÓNY

   Zbalená ukazuje len to, podľa čoho sa šablóna vyberá: názov, popis a koľko
   úloh z nej vznikne. Rozbalená ukazuje celý predpis.

   Zbalená je zámerne východiskový stav. Kto má päť šablón po ôsmich krokoch,
   by inak skroloval štyridsať riadkov vždy, keď si chce jednu z nich vybrať —
   a výber je to, kvôli čomu sem prišiel.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TemplateCardProps {
  template: TemplateSummary;
  /** Otvorí dialóg použitia — teda výber dňa, nie samotné použitie. */
  onApply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Beží akcia nad touto šablónou? Tlačidlá sa vtedy zamknú. */
  busy?: boolean;
}

export function TemplateCard({
  template,
  onApply,
  onEdit,
  onDelete,
  busy = false,
}: TemplateCardProps) {
  const [open, setOpen] = useState(false);
  /*
    Zmazanie šablóny je tvrdé — archív ju nezachytí, lebo predpis nie je záznam
    o vykonanej práci. Preto sa pýtame priamo v karte: dialóg by sa pri tak
    malom rozhodnutí len pýtal cez celú obrazovku, ale nepýtať sa vôbec by
    znamenalo stratiť rutinu jedným preklikom.
  */
  const [confirming, setConfirming] = useState(false);

  const ids = useId();
  const listId = `${ids}-ulohy`;
  const description = template.description?.trim() ?? "";
  const count = template.tasks.length;

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded border border-border bg-surface p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="min-w-0 break-words text-sm font-medium text-fg">
          {template.name}
        </h2>
        {description !== "" ? (
          <p className="min-w-0 break-words text-body leading-relaxed text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "inline-flex h-11 min-w-0 items-center gap-1.5 self-start rounded px-1 text-left sm:h-8",
          "text-meta text-fg-muted transition-colors duration-100 ease-out",
          "hover:bg-surface-2 hover:text-fg",
        )}
      >
        {open ? (
          <ChevronDown aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
        ) : (
          <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
        )}
        <span className="min-w-0 truncate">
          {count === 0 ? "Zatiaľ bez úloh" : taskCountLabel(count)}
        </span>
      </button>

      <div id={listId} hidden={!open}>
        {count === 0 ? (
          <p className="rounded border border-dashed border-border px-3 py-3 text-meta leading-relaxed text-fg-subtle">
            Šablóna nemá ani jednu úlohu — pri použití by nevzniklo nič. Doplň
            jej kroky cez „Upraviť".
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {template.tasks.map((task, index) => (
              <li
                // Riadky šablóny nemajú vlastný identifikátor — sú to hodnoty
                // v poli, takže poradie JE ich totožnosť.
                key={`${index}-${task.title}`}
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body"
              >
                <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-mini tabular-nums text-fg-muted">
                  {dayOffsetShort(task.dayOffset ?? 0)}
                </span>
                <span className="min-w-0 flex-1 break-words text-fg">{task.title}</span>

                {task.priority !== undefined && task.priority < 3 ? (
                  <PriorityDot priority={task.priority} size="sm" />
                ) : null}
                {task.energy !== undefined ? (
                  <EnergyBadge energy={task.energy} size="sm" />
                ) : null}
                {task.estimateMin !== undefined ? (
                  <span className="shrink-0 text-mini tabular-nums text-fg-subtle">
                    {formatDuration(task.estimateMin)}
                  </span>
                ) : null}
                {task.context !== undefined ? (
                  <span className="shrink-0 text-mini text-fg-subtle">
                    {task.context}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {confirming ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 rounded border border-danger bg-surface-2 px-2.5 py-2">
          <p className="min-w-0 flex-1 break-words text-body text-fg-muted">
            Zmazať šablónu „{template.name}"? Úlohy, ktoré z nej už vznikli,
            ostanú — mizne len predpis.
          </p>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Zmazať
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Nechať
          </Button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={busy || count === 0}
            onClick={onApply}
          >
            <CalendarPlus aria-hidden="true" size={15} />
            Použiť
          </Button>

          <Button
            type="button"
            disabled={busy}
            onClick={onEdit}
            aria-label={`Upraviť šablónu ${template.name}`}
          >
            <Pencil aria-hidden="true" size={15} />
            Upraviť
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirming(true)}
            aria-label={`Zmazať šablónu ${template.name}`}
            className="h-11 text-fg-subtle hover:text-danger sm:h-9"
          >
            <Trash2 aria-hidden="true" size={15} />
            Zmazať
          </Button>
        </div>
      )}
    </li>
  );
}

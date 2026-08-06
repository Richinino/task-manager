import type { ReactNode } from "react";
import {
  AtSign,
  CalendarClock,
  CalendarDays,
  Clock,
  Flag,
  Folder,
  Hash,
  type LucideIcon,
} from "lucide-react";

import { EnergyBadge, energyLabel } from "@/components/task/energy-badge";
import { EstimateChip, estimateLabel } from "@/components/task/estimate-chip";
import { formatLongSk, formatRelativeSk } from "@/lib/dates";
import type { ParsedCapture } from "@/lib/parse";
import { cn } from "@/lib/utils";

/**
 * Živý náhľad toho, čo parser vyčítal z jedného riadka.
 *
 * Celý zmysel tohto komponentu je odlíšiť **plán** od **termínu**:
 * „v piatok" je deň, kedy to idem robiť, „do piatku" je deň, dokedy to musí
 * byť hotové. Preto majú tieto dva čipy vlastný text, vlastnú ikonu aj
 * vlastnú farbu — nikdy sa nedajú zameniť.
 *
 * Ak parser nerozpoznal nič, komponent nevykreslí vôbec nič a nezaberie
 * ani pixel — input pri písaní nesmie poskakovať.
 */
export interface ParsePreviewProps {
  /** Výstup `parseCapture`, alebo `null`, keď je pole prázdne. */
  parsed: ParsedCapture | null;
  className?: string;
}

/* ── tóny ──────────────────────────────────────────────────────────────── */

const TONE_NEUTRAL = "border-border bg-surface-2 text-fg-muted";
const TONE_PLANNED = "border-accent/40 bg-accent-soft text-accent";
const TONE_DUE = "border-danger/40 bg-danger/10 text-danger";

const PRIORITY_TONE: Record<1 | 2 | 3, string> = {
  1: "border-p1/40 bg-p1/10 text-p1",
  2: "border-p2/40 bg-p2/10 text-p2",
  // Priorita 3 je predvolená — nemá kričať.
  3: TONE_NEUTRAL,
};

function Chip({
  Icon,
  title,
  tone = TONE_NEUTRAL,
  children,
}: {
  Icon?: LucideIcon;
  /** Celý popis pre myš aj pre pomalé čítanie. */
  title: string;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <li
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded border",
        "px-1.5 py-0.5 text-[11px] leading-4",
        tone,
      )}
    >
      {Icon ? <Icon aria-hidden="true" size={11} className="shrink-0" /> : null}
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

/* ── texty ─────────────────────────────────────────────────────────────── */

/** „dnes", „piatok", „12. aug" — plus čas, ak ho parser našiel. */
function shortWhen(date: string | undefined, time: string | undefined): string {
  if (date === undefined) return time ?? "";
  return time === undefined ? formatRelativeSk(date) : `${formatRelativeSk(date)} ${time}`;
}

/** „utorok 12. augusta o 15:00" — do titulku, kde je miesto na presnosť. */
function longWhen(date: string | undefined, time: string | undefined): string {
  if (date === undefined) return time === undefined ? "" : `o ${time}`;
  return time === undefined ? formatLongSk(date) : `${formatLongSk(date)} o ${time}`;
}

/**
 * Zhrnutie pre čítačky obrazovky. Čipy samotné sú pre ne skryté — inak by
 * pri každom stlačenom znaku predčítavali celý zoznam po kúskoch.
 */
function buildSummary(parsed: ParsedCapture): string {
  const parts: string[] = [];

  if (parsed.plannedDate !== undefined || parsed.plannedTime !== undefined) {
    parts.push(`naplánované na ${longWhen(parsed.plannedDate, parsed.plannedTime)}`);
  }
  if (parsed.dueDate !== undefined || parsed.dueTime !== undefined) {
    parts.push(`termín do ${longWhen(parsed.dueDate, parsed.dueTime)}`);
  }
  if (parsed.priority !== undefined) parts.push(`priorita ${parsed.priority}`);
  if (parsed.estimateMin !== undefined) parts.push(estimateLabel(parsed.estimateMin));
  if (parsed.energy !== undefined) parts.push(energyLabel(parsed.energy));
  if (parsed.projectName !== undefined) parts.push(`projekt ${parsed.projectName}`);
  if (parsed.context !== undefined) parts.push(`kontext ${parsed.context}`);
  for (const tag of parsed.tags) parts.push(`štítok ${tag}`);

  return parts.length === 0 ? "" : `Rozpoznané: ${parts.join(", ")}.`;
}

/* ── komponent ─────────────────────────────────────────────────────────── */

export function ParsePreview({ parsed, className }: ParsePreviewProps) {
  if (parsed === null) return null;

  const chips: ReactNode[] = [];

  /* Plán — kedy to idem robiť. */
  if (parsed.plannedDate !== undefined) {
    chips.push(
      <Chip
        key="planned"
        Icon={CalendarDays}
        tone={TONE_PLANNED}
        title={`naplánované na ${longWhen(parsed.plannedDate, parsed.plannedTime)}`}
      >
        plán: {shortWhen(parsed.plannedDate, parsed.plannedTime)}
      </Chip>,
    );
  } else if (parsed.plannedTime !== undefined) {
    chips.push(
      <Chip
        key="planned-time"
        Icon={Clock}
        tone={TONE_PLANNED}
        title={`naplánované o ${parsed.plannedTime}`}
      >
        plán: {parsed.plannedTime}
      </Chip>,
    );
  }

  /* Termín — dokedy to musí byť hotové. */
  if (parsed.dueDate !== undefined) {
    chips.push(
      <Chip
        key="due"
        Icon={CalendarClock}
        tone={TONE_DUE}
        title={`termín do ${longWhen(parsed.dueDate, parsed.dueTime)}`}
      >
        termín: do {shortWhen(parsed.dueDate, parsed.dueTime)}
      </Chip>,
    );
  } else if (parsed.dueTime !== undefined) {
    chips.push(
      <Chip
        key="due-time"
        Icon={Clock}
        tone={TONE_DUE}
        title={`termín do ${parsed.dueTime}`}
      >
        termín: do {parsed.dueTime}
      </Chip>,
    );
  }

  if (parsed.priority !== undefined) {
    chips.push(
      <Chip
        key="priority"
        Icon={Flag}
        tone={PRIORITY_TONE[parsed.priority]}
        title={`priorita ${parsed.priority}`}
      >
        priorita {parsed.priority}
      </Chip>,
    );
  }

  // Odhad aj energiu vykresľujú zdieľané komponenty — v čipe je len ich obal.
  if (parsed.estimateMin !== undefined) {
    chips.push(
      <Chip key="estimate" title={estimateLabel(parsed.estimateMin)}>
        <EstimateChip minutes={parsed.estimateMin} size="sm" />
      </Chip>,
    );
  }

  if (parsed.energy !== undefined) {
    chips.push(
      <Chip key="energy" title={energyLabel(parsed.energy)}>
        <EnergyBadge energy={parsed.energy} size="sm" />
      </Chip>,
    );
  }

  if (parsed.projectName !== undefined) {
    chips.push(
      <Chip key="project" Icon={Folder} title={`projekt ${parsed.projectName}`}>
        {parsed.projectName}
      </Chip>,
    );
  }

  if (parsed.context !== undefined) {
    chips.push(
      <Chip key="context" Icon={AtSign} title={`kontext ${parsed.context}`}>
        {parsed.context.replace(/^@/, "")}
      </Chip>,
    );
  }

  for (const tag of parsed.tags) {
    chips.push(
      <Chip key={`tag-${tag}`} Icon={Hash} title={`štítok ${tag}`}>
        {tag}
      </Chip>,
    );
  }

  // Nič rozpoznané → nič nevykreslíme. Input nesmie poskakovať pri každom znaku.
  if (chips.length === 0) return null;

  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{buildSummary(parsed)}</span>
      <ul aria-hidden="true" className="flex flex-wrap items-center gap-1">
        {chips}
      </ul>
    </div>
  );
}

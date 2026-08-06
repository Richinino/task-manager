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
import { formatDuration, formatLongSk, formatRelativeSk } from "@/lib/dates";
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

/* ── hranice úložiska ──────────────────────────────────────────────────── */

/**
 * Čo unesie databáza. Parser sám hranice nepozná („30h" vráti ako 1800 minút),
 * serverová akcia hodnotu oreže na maximum — a náhľad na to musí upozorniť
 * ešte pred uložením, inak by sľuboval niečo iné, než sa naozaj uloží.
 *
 * Čísla musia sedieť s `estimateSchema` a `contextSchema`
 * v `src/server/actions/tasks.ts`. Zdieľať sa nedajú importom — zo súboru
 * s `"use server"` smú viesť von len asynchrónne funkcie.
 */
const MAX_ESTIMATE_MIN = 1440;
const MAX_CONTEXT_LENGTH = 64;

/* ── tóny ──────────────────────────────────────────────────────────────── */

const TONE_NEUTRAL = "border-border bg-surface-2 text-fg-muted";
const TONE_PLANNED = "border-accent/40 bg-accent-soft text-accent";
const TONE_DUE = "border-danger/40 bg-danger/10 text-danger";
/** Hodnota sa uloží, ale inak, než ju používateľ napísal. */
const TONE_CLAMPED = "border-warn/40 bg-warn/10 text-warn";

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

/* ── orezanie na hranice úložiska ──────────────────────────────────────── */

/** Odhad tak, ako sa naozaj uloží. */
function storedEstimate(minutes: number): number {
  return Math.min(minutes, MAX_ESTIMATE_MIN);
}

/** Kontext tak, ako sa naozaj uloží (aj so znakom `@`). */
function storedContext(context: string): string {
  return context.trim().slice(0, MAX_CONTEXT_LENGTH);
}

/**
 * Vety o tom, čo sa uloží inak, než je napísané. Prázdne pole znamená,
 * že náhľad a uložený stav sedia znak po znaku.
 */
function buildClampNotes(parsed: ParsedCapture): string[] {
  const notes: string[] = [];

  if (parsed.estimateMin !== undefined && parsed.estimateMin > MAX_ESTIMATE_MIN) {
    notes.push(
      `Odhad ${formatDuration(parsed.estimateMin)} presahuje maximum — uloží sa ${formatDuration(
        MAX_ESTIMATE_MIN,
      )}.`,
    );
  }

  if (
    parsed.context !== undefined &&
    storedContext(parsed.context) !== parsed.context.trim()
  ) {
    notes.push(
      `Kontext je dlhší než ${MAX_CONTEXT_LENGTH} znakov — uloží sa skrátený.`,
    );
  }

  return notes;
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
  // Čítačka počuje hodnotu, ktorá sa uloží — nie tú, ktorú server oreže.
  if (parsed.estimateMin !== undefined) {
    parts.push(estimateLabel(storedEstimate(parsed.estimateMin)));
  }
  if (parsed.energy !== undefined) parts.push(energyLabel(parsed.energy));
  if (parsed.projectName !== undefined) parts.push(`projekt ${parsed.projectName}`);
  if (parsed.context !== undefined) {
    parts.push(`kontext ${storedContext(parsed.context)}`);
  }
  for (const tag of parsed.tags) parts.push(`štítok ${tag}`);

  const summary = parts.length === 0 ? "" : `Rozpoznané: ${parts.join(", ")}.`;
  const notes = buildClampNotes(parsed);
  return notes.length === 0 ? summary : `${summary} ${notes.join(" ")}`.trim();
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
    // Ukazujeme hodnotu po orezaní, aby čip nesľuboval viac, než sa uloží.
    const estimate = storedEstimate(parsed.estimateMin);
    const clamped = estimate !== parsed.estimateMin;
    chips.push(
      <Chip
        key="estimate"
        tone={clamped ? TONE_CLAMPED : TONE_NEUTRAL}
        title={
          clamped
            ? `${estimateLabel(parsed.estimateMin)} presahuje maximum — uloží sa ${formatDuration(
                estimate,
              )}`
            : estimateLabel(parsed.estimateMin)
        }
      >
        <EstimateChip
          minutes={estimate}
          size="sm"
          className={clamped ? "text-warn" : undefined}
        />
        {clamped ? <span className="ml-0.5">(max)</span> : null}
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
    const context = storedContext(parsed.context);
    const clamped = context !== parsed.context.trim();
    chips.push(
      <Chip
        key="context"
        Icon={AtSign}
        tone={clamped ? TONE_CLAMPED : TONE_NEUTRAL}
        title={
          clamped
            ? `kontext sa skráti na ${MAX_CONTEXT_LENGTH} znakov: ${context}`
            : `kontext ${context}`
        }
      >
        {context.replace(/^@/, "")}
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

  const notes = buildClampNotes(parsed);

  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{buildSummary(parsed)}</span>
      <ul aria-hidden="true" className="flex flex-wrap items-center gap-1">
        {chips}
      </ul>
      {/* Ticho orezanú hodnotu by používateľ nikdy neodhalil — povieme mu to
          skôr, než stlačí Enter. */}
      {notes.length > 0 ? (
        <p aria-hidden="true" className="mt-1 text-[11px] leading-4 text-warn">
          {notes.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

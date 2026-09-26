import { areaColorValue } from "@/components/task/area-dot";
import { isAssessment, type AgendaKind, type AgendaType } from "@/lib/agenda";
import { cn } from "@/lib/utils";
import type { AgendaProgress } from "@/server/queries/agenda";

/* ═══════════════════════════════════════════════════════════════════════════
   DROBNOSTI UDALOSTÍ

   Tvar, predmet a postup. Sú na jednom mieste, lebo sa kreslia na piatich
   obrazovkách a musia všade znamenať to isté — rovnaký dôvod, prečo má
   `school-kind.ts` jediný zoznam pomenovaní.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Tvar udalosti: ◆ udalosť, ⚑ deadline.
 *
 * **Tvar hovorí, čo to je; farba len dopĺňa.** Trojuholník (termín úlohy)
 * a krúžok (naplánované) už mesiac používa, takže udalosť dostala tvar,
 * ktorý sa s nimi nepletie ani bez farby. Písomka je `warn` — tou istou
 * farbou sa zvýrazňovala v riadku úlohy; jantárová a červená ostávajú
 * priorite dňa a „po termíne".
 */
export function AgendaShape({
  kind,
  type,
  className,
}: {
  kind: AgendaKind;
  type: AgendaType;
  className?: string;
}) {
  const tone =
    kind === "deadline" ? "text-fg" : isAssessment(type) ? "text-warn" : "text-fg-muted";

  return kind === "deadline" ? (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={cn("size-3 shrink-0", tone, className)}>
      <path d="M2.6.8v10.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.2 1.2h7.3L8.7 3.9l1.8 2.7H3.2Z" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={cn("size-3 shrink-0", tone, className)}>
      <path d="M6 .8 11.2 6 6 11.2.8 6Z" fill="currentColor" />
    </svg>
  );
}

/** Skratka predmetu s farebnou bodkou — tak, ako ju kreslí rozvrh. */
export function SubjectChip({ code, color }: { code: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-mini font-medium text-fg">
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: areaColorValue(color) }}
      />
      {code}
    </span>
  );
}

/**
 * Postup práce pod udalosťou — `2/3` s tenkou lištou.
 *
 * Nula úloh sa nekreslí vôbec: „0/0" by vyzeralo ako nesplnená povinnosť
 * pri koncerte, na ktorý sa nič nepripravuje.
 */
export function ProgressMini({ progress, className }: { progress: AgendaProgress; className?: string }) {
  if (progress.total === 0) return null;
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono text-mini text-fg-muted tabular-nums", className)}
      title={`Hotové ${progress.done} z ${progress.total}`}
    >
      <span aria-hidden="true" className="hidden h-1 w-9 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border sm:block">
        <span className="block h-full bg-success" style={{ width: `${pct}%` }} />
      </span>
      {progress.done}/{progress.total}
    </span>
  );
}

/**
 * Odpočet s dôrazom podľa blízkosti. Dnešok nesie akcent, zajtra a pozajtra
 * plné písmo, ďalej tichý text — nič nesvieti na červeno: udalosť nie je
 * „po termíne", len sa blíži.
 */
export function Countdown({ days, label }: { days: number; label: string }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono text-mini tabular-nums",
        days === 0
          ? "rounded-[3px] bg-accent-soft px-1.5 py-px font-medium text-accent"
          : days > 0 && days <= 2
            ? "font-medium text-fg"
            : "text-fg-muted",
      )}
    >
      {label}
    </span>
  );
}

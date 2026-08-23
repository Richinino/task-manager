import { cn } from "@/lib/utils";

/**
 * Pásik nad zoznamom úloh — štítok, limit dňa a nápoveda ku klávesnici.
 *
 * V návrhu („Dnes · počítač") to nie je nadpis nad kartou, ale **pruh cez
 * celú šírku** so spodnou linkou, presne ako riadok pod ním. Zoznam tak
 * pôsobí ako jedna súvislá tabuľka, nie ako kôpka kartičiek.
 *
 * WIP limit je päť čiarok, nie hlásenie. Doteraz sa človek o limite dozvedel
 * až vo chvíli, keď ho prekročil — čiarky ho ukazujú stále, takže je vidieť,
 * koľko miesta v dni ešte je. To je celý dôvod, prečo tam sú.
 */
export interface ListHeaderProps {
  /** Štítok sekcie, napr. „Naplánované na dnes". Kreslí sa verzálkami. */
  label: string;
  /** Koľko otvorených úloh deň má. */
  count?: number;
  /** Strop z nastavení (`settings.wipLimit`). */
  limit?: number;
  /** Nápoveda ku klávesnici — na úzkej obrazovke sa skryje. */
  hint?: string;
  /** Zladí pásik s farbou „po termíne". */
  tone?: "neutral" | "danger";
  className?: string;
}

/** Koľko čiarok sa ešte oplatí kresliť. Nad tým je z toho tapeta. */
const MAX_CIAROK = 12;

export function ListHeader({
  label,
  count,
  limit,
  hint,
  tone = "neutral",
  className,
}: ListHeaderProps) {
  const ukazLimit =
    count !== undefined && limit !== undefined && limit > 0 && limit <= MAX_CIAROK;

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border px-4 py-[9px] sm:px-5",
        tone === "danger" && "bg-danger-tint",
        className,
      )}
    >
      <span
        className={cn(
          "label shrink-0 font-medium",
          tone === "danger" ? "text-danger" : "text-fg-muted",
        )}
      >
        {label}
      </span>

      {ukazLimit ? (
        <>
          {/*
            Čiarky sú dekorácia — číslo vedľa nich nesie tú istú informáciu
            a čítačka ho prečíta. Preto `aria-hidden`.
          */}
          <span aria-hidden="true" className="ml-1 flex shrink-0 gap-0.5">
            {Array.from({ length: limit }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-3 rounded-xs sm:w-3.5",
                  i < (count ?? 0) ? "bg-fg" : "bg-border",
                )}
              />
            ))}
          </span>
          <span className="shrink-0 font-mono text-mini text-fg-muted tabular-nums">
            {count} / {limit}
            <span className="hidden sm:inline"> — limit dňa</span>
          </span>
        </>
      ) : null}

      {hint ? (
        <span className="ml-auto hidden shrink-0 font-mono text-mini text-fg-subtle lg:block">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

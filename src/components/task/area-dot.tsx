import { cn } from "@/lib/utils";

/**
 * Farebná bodka oblasti (voliteľne s názvom).
 *
 * Farba oblasti je používateľské dáta (`areas.color`), nie dizajnový token —
 * preto sa nastavuje inline zo zoznamu nižšie. Hodnoty sú zvolené tak,
 * aby boli čitateľné v svetlom aj tmavom režime.
 */
export interface AreaDotProps {
  /** Názov farby z `areas.color`, napr. „indigo". */
  color: string;
  name?: string;
  /** Zobraziť aj názov oblasti vedľa bodky. */
  showName?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const AREA_COLORS: Record<string, string> = {
  slate: "oklch(0.60 0.02 265)",
  gray: "oklch(0.60 0.01 285)",
  stone: "oklch(0.60 0.01 60)",
  red: "oklch(0.62 0.20 25)",
  orange: "oklch(0.68 0.16 55)",
  amber: "oklch(0.74 0.15 78)",
  yellow: "oklch(0.79 0.14 96)",
  lime: "oklch(0.74 0.17 130)",
  green: "oklch(0.64 0.16 150)",
  emerald: "oklch(0.66 0.14 162)",
  teal: "oklch(0.68 0.11 185)",
  cyan: "oklch(0.72 0.11 210)",
  sky: "oklch(0.68 0.13 235)",
  blue: "oklch(0.60 0.18 260)",
  indigo: "oklch(0.57 0.19 275)",
  violet: "oklch(0.60 0.20 295)",
  purple: "oklch(0.62 0.19 310)",
  fuchsia: "oklch(0.66 0.22 325)",
  pink: "oklch(0.66 0.19 350)",
  rose: "oklch(0.64 0.20 15)",
};

/** Neznáma farba nesmie zhodiť riadok — spadne na stlmenú neutrálnu. */
export function areaColorValue(color: string): string {
  return AREA_COLORS[color.trim().toLowerCase()] ?? "var(--fg-subtle)";
}

export function areaLabel(name: string): string {
  return `oblasť ${name}`;
}

export function AreaDot({
  color,
  name,
  showName = true,
  size = "md",
  className,
}: AreaDotProps) {
  const label = name ? areaLabel(name) : "oblasť";

  const dot = (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-full", size === "sm" ? "size-1.5" : "size-2")}
      style={{ backgroundColor: areaColorValue(color) }}
    />
  );

  if (!showName || !name) {
    return (
      <span role="img" aria-label={label} title={label} className={cn("inline-flex", className)}>
        {dot}
      </span>
    );
  }

  return (
    <span
      title={label}
      className={cn("inline-flex min-w-0 items-center gap-1 text-fg-muted", className)}
    >
      {dot}
      <span className="truncate">
        <span className="sr-only">oblasť </span>
        {name}
      </span>
    </span>
  );
}

import { cn } from "@/lib/utils";

/**
 * Bodka priority. Priorita 3 je default a má byť takmer neviditeľná —
 * v zozname nesmie kradnúť pozornosť tomu, čo je naozaj dôležité.
 *
 * Farba nie je jediný nosič informácie: p1 je plný krúžok, p2 prstenec
 * (prázdny stred) a p3 malá tlmená bodka. Rozdiel v tvare aj vo veľkosti
 * drží aj pri deuteranopii a protanopii, kde sú červená (22°) a oranžová
 * (62°) pri takmer rovnakej svetlosti nerozlíšiteľné. `title` a `aria-label`
 * sú až doplnok — na dotykovom zariadení sa hover nedá vyvolať.
 */
export interface PriorityDotProps {
  /** 1 = najvyššia, 3 = najnižšia. */
  priority: number;
  size?: "sm" | "md";
  className?: string;
}

/** Čokoľvek mimo 1 a 2 spadne na 3 — DB drží obyčajný integer. */
function normalizePriority(priority: number): 1 | 2 | 3 {
  if (priority === 1) return 1;
  if (priority === 2) return 2;
  return 3;
}

const TONE: Record<1 | 2 | 3, string> = {
  1: "text-p1",
  2: "text-p2",
  // Priorita 3 je „ticho" — stíši ju samotný odtieň `--p3`, krytie netreba.
  3: "text-p3",
};

/**
 * Tvar a veľkosť pre kompaktný riadok (sm) a pre plný riadok (md).
 *
 * `md` je z návrhu doslova: **všetky tri bodky sú 8 px a plné**, líšia sa
 * len odtieňom (`--p1/--p2/--p3`). Bola tu predtým aj odlišná veľkosť
 * a prstenec pre prioritu 2, aby sa dali rozoznať bez farby — návrh to
 * nemá a používateľ ho chcel presne tak, ako ho navrhol. Pre čítačku sa
 * nemení nič: bodka je `role="img"` s popisom „priorita N".
 *
 * `sm` (úzky stĺpec týždňa) v návrhu nie je, takže si rozlíšenie tvarom
 * ponecháva — tam sa bodky kreslia vedľa seba v 150 px stĺpci.
 */
const SHAPE: Record<1 | 2 | 3, Record<"sm" | "md", string>> = {
  1: { sm: "size-2 bg-current", md: "size-2 bg-current" },
  2: {
    sm: "size-2 border-[1.5px] border-current",
    md: "size-2 bg-current",
  },
  3: { sm: "size-1.5 bg-current", md: "size-2 bg-current" },
};

/** Textový popis pre čítačky obrazovky — farba nikdy nie je jediný nosič informácie. */
export function priorityLabel(priority: number): string {
  return `priorita ${normalizePriority(priority)}`;
}

export function PriorityDot({ priority, size = "md", className }: PriorityDotProps) {
  const level = normalizePriority(priority);
  const label = priorityLabel(level);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-block shrink-0 rounded-full",
        SHAPE[level][size],
        TONE[level],
        className,
      )}
    />
  );
}

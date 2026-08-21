import { Kbd } from "@/components/ui/kbd";

/**
 * Ukazovateľ triedenia — „Triediš 2 z 7" a pod tým skratky.
 *
 * Zmysel nie je ozdoba, ale sľub konca. Inbox s pätnástimi vecami vyzerá ako
 * nekonečná stena; „2 z 7" z toho spraví úsek s viditeľným dnom a človek
 * skôr dotriedi, než odíde. Preto tu nie je percento ani pruh — číslo,
 * ktoré klesá, je zrozumiteľnejšie než pruh, ktorý rastie.
 *
 * Skratky sú tu preto, že práve toto je jediná obrazovka, ktorú sa oplatí
 * ovládať naslepo z klávesnice. Na telefóne sa skryjú — tam nie je čo stlačiť.
 */
export interface TriageProgressProps {
  /** Poradie práve triedenej veci, počítané od jednotky. */
  position: number;
  total: number;
}

export function TriageProgress({ position, total }: TriageProgressProps) {
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-2">
      <p className="label text-fg-muted">
        Triediš {Math.min(position, total)} z {total}
      </p>

      <p
        aria-hidden="true"
        className="hidden items-center gap-2 text-mini text-fg-subtle sm:flex"
      >
        <span className="inline-flex items-center gap-1">
          <Kbd>1</Kbd>–<Kbd>4</Kbd> zaradiť
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>j</Kbd>
          <Kbd>k</Kbd> pohyb
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>x</Kbd> hotovo
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>⌫</Kbd> zahodiť
        </span>
      </p>
    </div>
  );
}

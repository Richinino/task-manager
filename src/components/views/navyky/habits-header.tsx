import { Sprout } from "lucide-react";

/**
 * Hlavička obrazovky návykov.
 *
 * Jedna veta musí byť jasná skôr, než človek niečo založí: **návyk nie je
 * úloha.** Kto si sem napíše „Vybaviť pas", bude čakať, že mu to vyskočí
 * v „Dnes", a keď sa to nestane, prestane appke veriť. A naopak — kto si
 * cvičenie zapíše ako opakovanú úlohu, zaplní si ním deň a rozpočet času,
 * hoci cvičenie deň nezapĺňa.
 *
 * Číslo pri nadpise je počet živých návykov. Zámerne bez odznaku „koľko dnes
 * ostáva": z návykov sa nesmie stať ďalší zoznam, ktorý treba dobehnúť.
 */
export interface HabitsHeaderProps {
  activeCount: number;
}

export function HabitsHeader({ activeCount }: HabitsHeaderProps) {
  return (
    <header>
      <div className="flex min-w-0 items-center gap-2">
        <Sprout aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
          Návyky
        </h1>
        {activeCount > 0 ? (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold tabular-nums text-fg-muted"
          >
            {activeCount}
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-fg-muted">
        Návyk je vec, ktorú chceš robiť opakovane — a preto{" "}
        <span className="font-medium text-fg">nezapĺňa deň</span>. Nemá termín,
        má týždenný cieľ: „štyrikrát do týždňa" prežije jeden pokazený deň,
        „dnes o šiestej" nie. Séria sa počíta na týždne, takže sa neláme
        v stredu, keď zaprší.
      </p>
    </header>
  );
}

import { ScreenHeader } from "@/components/shell/screen-chrome";

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
    <ScreenHeader title="Návyky">
      {activeCount > 0 ? (
        <span
          aria-hidden="true"
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 font-mono text-mini font-semibold tabular-nums text-fg-muted"
        >
          {activeCount}
        </span>
      ) : null}
    </ScreenHeader>
  );
}

/**
 * Veta pod hlavičkou. V návrhu je to samostatný pruh s vlastnou linkou —
 * vysvetľuje, čím sa táto obrazovka líši od tých vedľa nej.
 */
export function HabitsIntro() {
  return (
    <p className="shrink-0 border-b border-border px-5 py-[11px] text-pretty text-body leading-normal text-fg-muted">
        Návyk je vec, ktorú chceš robiť opakovane — a preto{" "}
        <span className="font-medium text-fg">nezapĺňa deň</span>. Nemá termín,
        má týždenný cieľ: „štyrikrát do týždňa“ prežije jeden pokazený deň,
        „dnes o šiestej“ nie. Séria sa počíta na týždne, takže sa neláme
        v stredu, keď zaprší.
    </p>
  );
}

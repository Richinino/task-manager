import { ScreenHeader } from "@/components/shell/screen-chrome";

/**
 * Hlavička obrazovky oblastí.
 *
 * Rovnako ako pri projektoch je tu jedna veta, ktorá musí byť jasná skôr,
 * než človek niečo založí — len z opačnej strany: oblasť sa nikdy nezavrie.
 * Kto si sem napíše „Presťahovať sa", bude čakať na deň, keď oblasť zmizne
 * zo zoznamu, a ten deň nepríde.
 */
export interface AreasHeaderProps {
  activeCount: number;
}

export function AreasHeader({ activeCount }: AreasHeaderProps) {
  return (
    <ScreenHeader title="Oblasti">
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
 * Veta o tom, čím sa oblasť líši od projektu.
 *
 * V návrhu je to samostatný pruh pod hlavičkou s vlastnou linkou. Patrí sem
 * z rovnakého dôvodu ako pri projektoch: bez nej vznikajú „oblasti" s
 * termínom, ktoré sa nikdy nedajú uzavrieť.
 */
export function AreasIntro() {
  return (
    <p className="shrink-0 border-b border-border px-5 py-[11px] text-pretty text-body leading-normal text-fg-muted">
      Oblasť je okruh života, ktorý sa len udržiava a{" "}
      <span className="font-medium text-fg">nikdy nekončí</span> — zdravie,
      financie, domácnosť, práca. Nemá cieľ ani termín; keby ho mala, je to
      projekt. Farba oblasti sa objaví ako bodka pri každej úlohe, ktorá do nej
      patrí.
    </p>
  );
}

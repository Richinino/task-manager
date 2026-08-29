import { ScreenHeader } from "@/components/shell/screen-chrome";

/**
 * Hlavička obrazovky nápadov.
 *
 * Vznikla neskoro: `/napady` bola jediná obrazovka bez `<h1>`. Pre oko to
 * nebolo vidieť — pásma majú vlastné nadpisy — ale čítačka obrazovky sa
 * podľa nadpisov naviguje, a tu nemala kam skočiť. Zároveň sa vysvetlenie,
 * čím sa nápad líši od úlohy, dovtedy ukázalo len vtedy, keď obrazovka bola
 * úplne prázdna. Práve tam ho pritom netreba: kto ju vidí prázdnu, ešte
 * nemá čo pomýliť.
 *
 * Text je zámerne kratší než v prázdnom stave — ten ostáva ako uvítanie.
 */
export interface IdeasHeaderProps {
  /** Nápady, ktoré ešte niekam smerujú (bez vybavených). */
  activeCount: number;
}

export function IdeasHeader({ activeCount }: IdeasHeaderProps) {
  return (
    <ScreenHeader title="Nápady">
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
export function IdeasIntro() {
  return (
    <p className="shrink-0 border-b border-border px-5 py-[11px] text-pretty text-body leading-normal text-fg-muted">
        Úloha je záväzok — musí sa spraviť. Nápad je{" "}
        <span className="font-medium text-fg">možnosť</span> — mohlo by sa.
        Preto tu nie sú termíny ani priority: nápad nikam nemešká. Zapíš ho,
        daj mu iskru a nechaj ležať. Časť sama vyhnije, z časti raz spravíš
        projekt.
    </p>
  );
}

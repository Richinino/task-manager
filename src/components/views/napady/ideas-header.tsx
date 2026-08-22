import { Lightbulb } from "lucide-react";

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
    <header>
      <div className="flex min-w-0 items-center gap-2">
        <Lightbulb aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
          Nápady
        </h1>
        {activeCount > 0 ? (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 text-mini font-semibold font-mono tabular-nums text-fg-muted"
          >
            {activeCount}
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-fg-muted">
        Úloha je záväzok — musí sa spraviť. Nápad je{" "}
        <span className="font-medium text-fg">možnosť</span> — mohlo by sa.
        Preto tu nie sú termíny ani priority: nápad nikam nemešká. Zapíš ho,
        daj mu iskru a nechaj ležať. Časť sama vyhnije, z časti raz spravíš
        projekt.
      </p>
    </header>
  );
}

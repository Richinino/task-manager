import { SETTINGS_SECTIONS, sectionId } from "@/components/views/nastavenia/sections";

/**
 * Bočný zoznam sekcií nastavení.
 *
 * Formulár má sedem sekcií a na 800 px sa z neho naraz vidia dve. Bez tohto
 * zoznamu sa „Kde mám prahy odkladania" hľadá rolovaním hore-dole; s ním je
 * to jedno kliknutie.
 *
 * Sú to obyčajné kotvy (`#id`), nie klientský stav — fungujú bez JavaScriptu,
 * dajú sa otvoriť v novej karte a prehliadač ich rieši natívne vrátane
 * plynulého posunu. Zvýraznenie práve otvorenej sekcie zámerne nemáme:
 * potrebovalo by to sledovač rolovania a je to ozdoba, nie funkcia.
 *
 * Pod `md` sa nekreslí — na telefóne je 200 px stĺpec vedľa formulára
 * nemožný a rolovanie palcom je tam aj tak rýchlejšie než mierenie na
 * dvanásťpixelové odkazy.
 */

export interface SettingsNavProps {
  /**
   * Je sekcia „Pripomienky" vôbec na stránke?
   *
   * Kreslí sa len s nastavenými kľúčmi VAPID. Bez tejto informácie by tu bol
   * odkaz na kotvu, ktorá na stránke nie je — kliknutie by nespravilo nič
   * a človek by hľadal chybu u seba.
   */
  hasPush: boolean;
}

export function SettingsNav({ hasPush }: SettingsNavProps) {
  return (
    <nav
      aria-label="Sekcie nastavení"
      className="hidden w-[200px] shrink-0 flex-col overflow-y-auto border-r border-border md:flex"
    >
      <ul className="shrink-0">
        {SETTINGS_SECTIONS.filter(
          (nazov) => hasPush || nazov !== "Pripomienky",
        ).map((nazov) => (
          <li key={nazov}>
            <a
              href={`#${sectionId(nazov)}`}
              className="flex h-9 items-center border-b border-border px-4 text-body text-fg-muted transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg"
            >
              <span className="min-w-0 truncate">{nazov}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="flex-1" />

      {/*
        Verzia je tu zámerne najtichšia vec na obrazovke. Nepotrebuješ ju
        nikdy — až v tej jednej chvíli, keď niečo nefunguje a treba povedať,
        ktorá verzia to robí.
      */}
      <p className="shrink-0 border-t border-border px-4 py-3 font-mono text-micro text-fg-subtle">
        Task manažér
      </p>
    </nav>
  );
}

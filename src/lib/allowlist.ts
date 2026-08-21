/**
 * Kto sa smie prihlásiť.
 *
 * Vlastný modul, a nie pár riadkov v `auth.ts`, z jediného dôvodu: je to
 * **jediná zábrana pri vstupe do appky** a chyba v nej sa nijako neprejaví —
 * appka funguje ďalej, len je otvorená. Takú vec treba vedieť otestovať bez
 * servera, bez Auth.js a bez premenných prostredia.
 *
 * Čisté funkcie: zoznam aj rozhodnutie prichádzajú zvonku.
 */

/**
 * Prečíta zoznam e-mailov oddelených čiarkou.
 *
 * Znáša medzery navyše, veľké písmená aj prázdne položky po zbytočnej čiarke
 * — do premennej prostredia sa píše ručne a preklep tam nemá zavrieť dvere
 * niekomu, kto je v zozname napísaný správne.
 */
export function parseAllowList(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== ""),
  );
}

/**
 * Smie tento e-mail dnu?
 *
 * **Prázdny zoznam znamená „nikto", nie „ktokoľvek".** Toto je celý zmysel
 * modulu. Predtým platil opak — podmienka znela „ak je zoznam nastavený
 * a e-mail v ňom nie je, odmietni" — takže zabudnutá alebo omylom zmazaná
 * premenná otvorila appku každému, kto má Google účet. Nič to nenahlásilo;
 * zistilo by sa to až tým, že vnútri sedí cudzí človek.
 *
 * Mimo produkcie sa zoznam nevyžaduje, inak by sa vývoj bez `.env` nedal
 * rozbehnúť. Na vlastnom počítači nie je koho pustiť dnu omylom.
 */
export function isAllowed(
  email: string,
  allowList: ReadonlySet<string>,
  isProduction: boolean,
): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized === "") return false;
  if (allowList.size === 0) return !isProduction;
  return allowList.has(normalized);
}

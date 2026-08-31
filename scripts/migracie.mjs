/**
 * Porovnanie migrácií v repozitári s tým, čo naozaj dobehlo v databáze.
 *
 * Toto je čistá časť kontroly — bez súborov a bez siete, aby sa dala
 * otestovať. Vstupy si obstará `kontrola-migracii.mjs`.
 *
 * ## Prečo to vôbec existuje
 *
 * Neon sa nemigruje sám. Poradie je vždy migrácia → push → nasadenie, lenže
 * Vercel nasadzuje pri každom pushi automaticky — takže na to poradie nikto
 * nedostane šancu, ak si naň nespomenie skôr, než stlačí Enter. Keď sa to
 * poplietlo, appka siahla na stĺpec, ktorý v produkcii nebol, a spadli
 * VŠETKY obrazovky za prihlásením naraz (30. 8. 2026, stĺpec `stays_on_day`).
 *
 * Preto sa to kontroluje pri builde: keď v repozitári leží migrácia, ktorá
 * v produkcii nedobehla, build zlyhá a Vercel ostane na poslednej funkčnej
 * verzii. Zlyhaný build je nepríjemnosť, spadnutá appka je výpadok.
 *
 * ## Ako Drizzle rozhoduje
 *
 * Sledované je to isté, čo pozerá samotný migrátor (`drizzle-orm/migrator`):
 * tabuľka `drizzle.__drizzle_migrations` so stĺpcami `hash` (SHA-256 obsahu
 * `.sql` súboru) a `created_at` (hodnota `when` zo žurnálu). Migrátor pustí
 * všetko, čo má `when` väčšie než najnovšie `created_at` — takže presne to
 * tu považujeme za „nedobehnuté".
 */

/**
 * @typedef {object} ZaznamZurnalu
 * @property {string} tag  Názov migrácie, napr. `0003_neprenasane_ulohy`.
 * @property {number} when Časová pečiatka zo žurnálu (ms).
 * @property {string} hash SHA-256 obsahu `.sql` súboru.
 */

/**
 * @typedef {object} AplikovanaMigracia
 * @property {string} hash
 * @property {number} createdAt
 */

/**
 * @param {readonly ZaznamZurnalu[]} zurnal
 * @param {readonly AplikovanaMigracia[]} aplikovane
 * @returns {{ chybajuce: string[], zmenene: string[] }}
 */
export function porovnajMigracie(zurnal, aplikovane) {
  /*
    Prázdna databáza nemá ani tabuľku migrácií, takže `aplikovane` príde
    prázdne a hranicou je `-1` — nedobehnuté je potom všetko. To je správne:
    na čerstvú databázu naozaj treba pustiť celý žurnál.
  */
  const hranica = aplikovane.reduce((max, m) => Math.max(max, m.createdAt), -1);
  const hashe = new Set(aplikovane.map((m) => m.hash));

  const chybajuce = [];
  const zmenene = [];

  for (const zaznam of zurnal) {
    if (zaznam.when > hranica) {
      chybajuce.push(zaznam.tag);
      continue;
    }
    /*
      Migrácia, ktorá už dobehla, ale jej súbor sa medzitým zmenil. Migrátor
      ju druhýkrát NEPUSTÍ (rozhoduje sa podľa času, nie podľa obsahu), takže
      by rozdiel ticho ležal v repozitári a v databáze by nikdy nebol.
      Väčšinou to znamená, že niekto upravil už nasadenú migráciu namiesto
      toho, aby vygeneroval novú.
    */
    if (!hashe.has(zaznam.hash)) zmenene.push(zaznam.tag);
  }

  return { chybajuce, zmenene };
}

/**
 * Smie sa v tomto prostredí pustiť migrácia? Vracia dôvod, prečo NIE, alebo
 * `null`, keď sa smie.
 *
 * Je to čistá funkcia nad premennými prostredia, a to zámerne: je to jediné
 * miesto, ktoré rozhoduje, či sa siahne na ostrú databázu. Keby žilo
 * v skripte medzi sieťou a súbormi, nedalo by sa naň napísať test — a práve
 * tu je chyba najdrahšia.
 *
 * Poradie podmienok je súčasťou významu:
 *
 * 1. `SKIP_MIGRATION=1` vypína všetko. Keby sa pokazil samotný krok, nesmie
 *    byť jediná vec, ktorá blokuje nasadenie opravy.
 * 2. `MIGROVAT_PRI_BUILDE=1` je vedomé vynútenie a preváži prostredie.
 * 3. Bez `DATABASE_URL` beží lokálny PGlite, ktorý sa migruje sám.
 * 4. Inak sa migruje **len pri produkčnom nasadení**. Náhľadové buildy
 *    stavajú vetvy, ktoré nikto neschválil, a mieria na tú istú produkčnú
 *    databázu; lokálny build s produkčnou premennou v prostredí by na ňu
 *    siahol omylom.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function dovodPreskocenia(env) {
  if (env.SKIP_MIGRATION === "1") return "SKIP_MIGRATION=1";
  if (env.MIGROVAT_PRI_BUILDE === "1") return null;

  if (!env.DATABASE_URL?.trim()) {
    return "bez DATABASE_URL beží lokálny PGlite, ktorý sa migruje sám";
  }
  if (env.VERCEL_ENV !== "production") {
    return `nie je to produkčné nasadenie (${env.VERCEL_ENV ?? "mimo Vercelu"})`;
  }
  return null;
}


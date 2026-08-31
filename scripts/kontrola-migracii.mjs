/**
 * Brána pred nasadením: nepustí von kód, ktorý čaká na migráciu.
 *
 * Beží v `npm run build` hneď za automatickou migráciou. Keď v repozitári
 * leží migrácia, ktorá v produkčnej databáze nedobehla, build zlyhá a Vercel
 * ostane na poslednej funkčnej verzii. Zlyhaný build je nepríjemnosť,
 * spadnutá appka je výpadok — a tento konkrétny výpadok už raz bol
 * (30. 8. 2026, stĺpec `stays_on_day`, všetky obrazovky za prihlásením).
 *
 * **Nie je to zbytočné zdvojenie.** Migrácia sa zámerne nepúšťa všade —
 * náhľadové buildy a lokálne builds ju preskočia — takže kontrola je jediné
 * miesto, ktoré platí VŽDY. A keby migrátor skončil bez chyby a databázu
 * nezmenil, brána to zachytí namiesto používateľa.
 *
 * ## Kedy sa preskočí
 *
 * - **Bez `DATABASE_URL`** — lokálny vývoj beží na PGlite, ktorý sa migruje
 *   sám pri štarte. Nie je čo strážiť.
 * - **`SKIP_MIGRATION_CHECK=1`** — únikový východ. Keby sa kontrola sama
 *   pokazila, nesmie byť jediná vec, ktorá blokuje nasadenie opravy.
 *
 * ## Prečo nedostupná databáza zhodí build
 *
 * Zámerne fail-closed. Keď sa k databáze nevieme pripojiť pri builde,
 * nevieme ani povedať, že je nasadenie bezpečné — a appka, ktorá sa
 * k databáze nedostane, aj tak nefunguje. Skúša sa dvakrát, aby prebudenie
 * spiaceho Neonu nezhodilo nasadenie zbytočne.
 */

import {
  nacitajAplikovane,
  nacitajZurnal,
  vypis,
  vytvorPool,
} from "./db-migracie.mjs";
import { porovnajMigracie } from "./migracie.mjs";

const POKUSY = 2;

async function main() {
  if (process.env.SKIP_MIGRATION_CHECK === "1") {
    vypis(["Kontrola migrácií preskočená (SKIP_MIGRATION_CHECK=1)."]);
    return;
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    vypis(["Kontrola migrácií preskočená — bez DATABASE_URL beží lokálny PGlite."]);
    return;
  }

  const zurnal = nacitajZurnal();
  if (zurnal.length === 0) {
    vypis(["Žiadne migrácie v repozitári — nie je čo kontrolovať."]);
    return;
  }

  let aplikovane;
  for (let pokus = 1; pokus <= POKUSY; pokus++) {
    const pool = await vytvorPool(url);
    try {
      aplikovane = await nacitajAplikovane(pool);
      break;
    } catch (chyba) {
      if (pokus === POKUSY) {
        vypis([
          "",
          "K databáze sa nedá pripojiť, takže sa nedá povedať, či je nasadenie bezpečné.",
          `Dôvod: ${chyba instanceof Error ? chyba.message : String(chyba)}`,
          "",
          "Keď je databáza v poriadku a blokuje to len táto kontrola, pusti build",
          "s premennou SKIP_MIGRATION_CHECK=1.",
          "",
        ]);
        process.exit(1);
      }
    } finally {
      await pool.end().catch(() => {});
    }
  }

  const { chybajuce, zmenene } = porovnajMigracie(zurnal, aplikovane);

  if (chybajuce.length === 0 && zmenene.length === 0) {
    vypis([`Migrácie sedia — v databáze dobehlo všetkých ${zurnal.length}.`]);
    return;
  }

  const riadky = [""];

  if (chybajuce.length > 0) {
    riadky.push(
      chybajuce.length === 1
        ? "V databáze nedobehla táto migrácia:"
        : `V databáze nedobehli tieto migrácie (${chybajuce.length}):`,
      ...chybajuce.map((tag) => `  · ${tag}`),
      "",
      "Nasadiť tento kód by znamenalo, že appka siahne na stĺpec alebo tabuľku,",
      "ktorá v produkcii nie je — a spadne.",
      "",
      "Pri produkčnom nasadení sa migrácia púšťa sama krok predtým. Ak si to",
      "čítaš, buď to bol náhľadový build (tam sa zámerne nemigruje), alebo",
      "automatika zlyhala — dôvod bude vo výpise nad týmto.",
      "",
      "Ručne:",
      "",
      '  $env:DATABASE_URL="<connection-string>"; npm run db:migrate',
      "",
    );
  }

  if (zmenene.length > 0) {
    riadky.push(
      "Tieto migrácie už dobehli, ale ich súbor sa medzitým zmenil:",
      ...zmenene.map((tag) => `  · ${tag}`),
      "",
      "Migrátor ich druhýkrát nepustí — rozhoduje sa podľa času, nie podľa obsahu.",
      "Zmenu vráť späť a vygeneruj novú migráciu (npm run db:generate).",
      "",
    );
  }

  process.stderr.write(`${riadky.join("\n")}\n`);
  process.exit(1);
}

await main();

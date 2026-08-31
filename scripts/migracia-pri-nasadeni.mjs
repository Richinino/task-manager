/**
 * Migrácia, ktorá dobehne sama pri nasadení.
 *
 * Beží ako prvý krok `npm run build`, teda na Verceli tesne pred tým, než sa
 * appka postaví. Nahrádza to ručné `db:migrate` z terminálu — krok, na ktorý
 * sa dvakrát zabudlo a raz z toho bol výpadok celej appky za prihlásením.
 *
 * Connection string sa nikam nekopíruje: `DATABASE_URL` už na Verceli je,
 * lebo z neho číta aj bežiaca appka aj brána `kontrola:migracie`.
 *
 * ## Kedy sa NEspustí
 *
 * - **Mimo produkčného nasadenia.** Rozhoduje `VERCEL_ENV`, nie prítomnosť
 *   `DATABASE_URL`. Náhľadové (preview) buildy stavajú kód z vetiev, ktoré
 *   ešte nikto neschválil, a mieria na tú istú produkčnú databázu — nechať
 *   ich migrovať by znamenalo, že rozrobená vetva prepíše schému produkcie.
 *   Rovnako lokálny `npm run build` s produkčnou premennou v prostredí
 *   nesmie siahnuť na ostrú databázu omylom.
 * - **Bez `DATABASE_URL`** — lokálny vývoj beží na PGlite, ktorý sa migruje
 *   sám pri štarte.
 * - **`SKIP_MIGRATION=1`** — únikový východ, keby sa pokazil samotný skript.
 *
 * Ručne sa dá vynútiť cez `MIGROVAT_PRI_BUILDE=1`.
 *
 * ## Na čo sa tým spoliehame
 *
 * **Migrácie musia ostať pridávacie.** Keď migrácia dobehne a build potom
 * zlyhá na niečom inom (preklad, test), v databáze je nová schéma, ale
 * navonok ďalej beží stará verzia appky. Pridaný stĺpec starému kódu
 * neprekáža — zmazaný alebo premenovaný by ho zložil. Kým to platí, je
 * automatika bezpečnejšia než človek, ktorý na krok zabudne; keby raz
 * prišla naozaj búracia migrácia, patrí pustiť ručne a mimo nasadenia.
 *
 * ## Prečo zámok
 *
 * Dva pushnutia krátko po sebe znamenajú dva súbežné buildy a dvoch
 * migrátorov nad jednou databázou. Poradový zámok (`pg_advisory_lock`) ich
 * zoradí za seba — druhý počká, uvidí, že je už všetko dobehnuté, a skončí.
 */

import {
  CAKANIE_MS,
  PRIECINOK,
  nacitajAplikovane,
  nacitajZurnal,
  vypis,
  vytvorPool,
} from "./db-migracie.mjs";
import { dovodPreskocenia, porovnajMigracie } from "./migracie.mjs";

/**
 * Kľúč poradového zámku. Ľubovoľné, ale stále rovnaké číslo — zámky sa
 * porovnávajú podľa neho a dve rôzne hodnoty by sa navzájom nezoradili.
 */
const ZAMOK = 8_150_477;

const POKUSY_O_ZAMOK = 12;
const CAKANIE_NA_ZAMOK_MS = 5_000;

function spi(ms) {
  return new Promise((hotovo) => setTimeout(hotovo, ms));
}

async function ziskajZamok(pool) {
  for (let pokus = 1; pokus <= POKUSY_O_ZAMOK; pokus++) {
    const { rows } = await pool.query("select pg_try_advisory_lock($1) as ok", [ZAMOK]);
    if (rows[0]?.ok === true) return true;
    await spi(CAKANIE_NA_ZAMOK_MS);
  }
  return false;
}

async function main() {
  const dovod = dovodPreskocenia(process.env);
  if (dovod !== null) {
    vypis([`Automatická migrácia preskočená — ${dovod}.`]);
    return;
  }

  const zurnal = nacitajZurnal();
  if (zurnal.length === 0) {
    vypis(["Žiadne migrácie v repozitári — nie je čo púšťať."]);
    return;
  }

  const pool = await vytvorPool(process.env.DATABASE_URL.trim());

  try {
    if (!(await ziskajZamok(pool))) {
      /*
        Fail-closed. Keď zámok drží niekto iný dlhšie než minútu, buď beží
        veľmi dlhá migrácia, alebo niekde ostalo visieť spojenie. Ani jedno
        nie je stav, v ktorom sa má ticho nasadiť.
      */
      process.stderr.write(
        [
          "",
          "Nepodarilo sa získať zámok na migráciu — pravdepodobne beží iné nasadenie.",
          "Skús build spustiť znova o chvíľu.",
          "",
        ].join("\n") + "\n",
      );
      process.exit(1);
    }

    const pred = await nacitajAplikovane(pool);
    const { chybajuce } = porovnajMigracie(zurnal, pred);

    if (chybajuce.length === 0) {
      vypis([`Migrácie sedia — v databáze už dobehlo všetkých ${zurnal.length}.`]);
      return;
    }

    vypis([
      chybajuce.length === 1
        ? "Púšťam migráciu:"
        : `Púšťam migrácie (${chybajuce.length}):`,
      ...chybajuce.map((tag) => `  · ${tag}`),
    ]);

    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");

    await migrate(drizzle(pool), { migrationsFolder: PRIECINOK });

    const po = await nacitajAplikovane(pool);
    const { chybajuce: stale } = porovnajMigracie(zurnal, po);

    if (stale.length > 0) {
      /*
        Migrátor skončil bez chyby, ale bookkeeping tvrdí niečo iné. Ticho to
        prejsť by znamenalo nasadiť kód na schému, o ktorej nevieme, čo je
        v nej — a to je presne ten výpadok, kvôli ktorému toto celé vzniklo.
      */
      process.stderr.write(
        [
          "",
          "Migrátor dobehol, ale v databáze stále chýba:",
          ...stale.map((tag) => `  · ${tag}`),
          "",
        ].join("\n") + "\n",
      );
      process.exit(1);
    }

    vypis([`Hotovo — v databáze je teraz všetkých ${zurnal.length} migrácií.`]);
  } catch (chyba) {
    process.stderr.write(
      [
        "",
        "Migráciu sa nepodarilo pustiť, takže sa nenasadzuje.",
        `Dôvod: ${chyba instanceof Error ? chyba.message : String(chyba)}`,
        "",
        "Keď je databáza v poriadku a blokuje to len tento krok, pusti migráciu",
        "ručne a build zopakuj so SKIP_MIGRATION=1.",
        "",
      ].join("\n") + "\n",
    );
    process.exit(1);
  } finally {
    /*
      Zámok sa pustí sám zánikom spojenia, ale spoliehať sa na to by
      znamenalo držať ho ešte niekoľko sekúnd po skončení skriptu — a práve
      vtedy sa o neho uchádza druhý build.
    */
    await pool.query("select pg_advisory_unlock($1)", [ZAMOK]).catch(() => {});
    await pool.end().catch(() => {});
  }
}

/* Časový strop na celý krok, aby zaseknuté spojenie nedržalo build navždy. */
const strop = setTimeout(
  () => {
    process.stderr.write("\nMigrácia trvá príliš dlho — build sa zastavuje.\n");
    process.exit(1);
  },
  CAKANIE_MS + POKUSY_O_ZAMOK * CAKANIE_NA_ZAMOK_MS + 120_000,
);
strop.unref();

await main();

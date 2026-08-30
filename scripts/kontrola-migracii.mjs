/**
 * Brána pred nasadením: nepustí von kód, ktorý čaká na migráciu.
 *
 * Beží ako prvý krok `npm run build`, teda aj na Verceli. Keď v repozitári
 * leží migrácia, ktorá v produkčnej databáze nedobehla, build zlyhá a Vercel
 * ostane na poslednej funkčnej verzii. Zlyhaný build je nepríjemnosť,
 * spadnutá appka je výpadok — a tento konkrétny výpadok už raz bol
 * (30. 8. 2026, stĺpec `stays_on_day`, všetky obrazovky za prihlásením).
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

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { porovnajMigracie } from "./migracie.mjs";

const PRIECINOK = path.join("src", "db", "migrations");
const POKUSY = 2;
const CAKANIE_MS = 15_000;

/** Prečíta žurnál a k nemu hash každého `.sql` — presne ako to robí Drizzle. */
function nacitajZurnal() {
  const cestaZurnalu = path.join(PRIECINOK, "meta", "_journal.json");
  if (!fs.existsSync(cestaZurnalu)) return [];

  const zurnal = JSON.parse(fs.readFileSync(cestaZurnalu, "utf8"));
  return (zurnal.entries ?? []).map((zaznam) => {
    const obsah = fs.readFileSync(path.join(PRIECINOK, `${zaznam.tag}.sql`), "utf8");
    return {
      tag: zaznam.tag,
      when: zaznam.when,
      hash: crypto.createHash("sha256").update(obsah).digest("hex"),
    };
  });
}

/**
 * Čo už v databáze dobehlo.
 *
 * Chýbajúca tabuľka NIE JE chyba — na čerstvej databáze ju vytvorí až prvá
 * migrácia. Vtedy platí, že nedobehlo nič.
 */
async function nacitajAplikovane(url) {
  const { Pool } = await import("pg");
  const lokalna = url.includes("localhost") || url.includes("127.0.0.1");
  const pool = new Pool({
    connectionString: url,
    ssl: lokalna ? false : { rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: CAKANIE_MS,
  });

  try {
    const { rows } = await pool.query(
      `select hash, created_at from drizzle.__drizzle_migrations`,
    );
    return rows.map((r) => ({ hash: r.hash, createdAt: Number(r.created_at) }));
  } catch (chyba) {
    // 42P01 = tabuľka neexistuje, 3F000 = schéma neexistuje.
    if (chyba?.code === "42P01" || chyba?.code === "3F000") return [];
    throw chyba;
  } finally {
    await pool.end().catch(() => {});
  }
}

function vypis(riadky) {
  process.stdout.write(`${riadky.join("\n")}\n`);
}

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
    try {
      aplikovane = await nacitajAplikovane(url);
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
      "ktorá v produkcii nie je — a spadne. Pusti najprv migráciu:",
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

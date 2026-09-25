/**
 * Spoločné čítanie migrácií — pre bránu aj pre automatickú migráciu.
 *
 * Obe potrebujú to isté: žurnál z repozitára a to, čo už v databáze dobehlo.
 * Keby si každá držala vlastnú kópiu, ktorá počíta hash alebo si vykladá
 * bookkeeping tabuľku po svojom, časom by tvrdili niečo iné — a to je presne
 * ten druh nezhody, ktorý sa objaví až vo výpadku.
 *
 * Čisté porovnanie žije vedľa v `migracie.mjs` a má vlastné testy. Sem patrí
 * len vstup a výstup, ktorý sa testovať nedá.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PRIECINOK = path.join("src", "db", "migrations");

/** Koľko čakať na spojenie. Neon sa musí stihnúť prebudiť zo spánku. */
export const CAKANIE_MS = 15_000;

/** Prečíta žurnál a k nemu hash každého `.sql` — presne ako to robí Drizzle. */
export function nacitajZurnal() {
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
 * Jedno spojenie, nie fond.
 *
 * Skript beží krátko a spraví hŕstku dotazov; navyše zámok drží spojenie,
 * takže viac spojení by znamenalo, že zámok drží iné než to, ktoré migruje.
 */
export async function vytvorPool(url) {
  const { Pool } = await import("pg");
  const lokalna = url.includes("localhost") || url.includes("127.0.0.1");
  return new Pool({
    connectionString: url,
    ssl: lokalna ? false : { rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: CAKANIE_MS,
  });
}

/**
 * Čo už v databáze dobehlo.
 *
 * Chýbajúca tabuľka NIE JE chyba — na čerstvej databáze ju vytvorí až prvá
 * migrácia. Vtedy platí, že nedobehlo nič.
 */
export async function nacitajAplikovane(pool) {
  try {
    const { rows } = await pool.query(
      `select hash, created_at from drizzle.__drizzle_migrations`,
    );
    return rows.map((r) => ({ hash: r.hash, createdAt: Number(r.created_at) }));
  } catch (chyba) {
    // 42P01 = tabuľka neexistuje, 3F000 = schéma neexistuje.
    if (chyba?.code === "42P01" || chyba?.code === "3F000") return [];
    throw chyba;
  }
}

export function vypis(riadky) {
  process.stdout.write(`${riadky.join("\n")}\n`);
}

/**
 * Čitateľný dôvod chyby spojenia.
 *
 * Odmietnuté spojenie vráti `pg` ako `AggregateError` — jeden pokus na IPv4
 * a jeden na IPv6 — a ten má **prázdne** `message`. Výpis potom končil holým
 * „Dôvod:" bez ničoho, presne v situácii, keď je dôvod to jediné, čo treba
 * vedieť. Preto sa siaha aj do vnorených chýb a na ich kód (`ECONNREFUSED`).
 */
export function popisChyby(chyba) {
  if (!(chyba instanceof Error)) return String(chyba);
  if (chyba.message.trim() !== "") return chyba.message;

  const vnorene = Array.isArray(chyba.errors) ? chyba.errors : [];
  const casti = vnorene
    .map((e) => (e instanceof Error ? e.message || e.code || e.name : String(e)))
    .filter((text) => text !== "");
  if (casti.length > 0) return [...new Set(casti)].join("; ");

  return chyba.code ?? chyba.name;
}

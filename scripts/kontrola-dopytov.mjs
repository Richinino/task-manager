/**
 * Kontrola, že žiadny dopyt nečíta cez používateľov.
 *
 * Toto je jediný invariant, na ktorom stojí to, že appku môžu používať dvaja
 * ľudia. Preklad ho nechytí — `db.select().from(tasks)` je typovo úplne
 * v poriadku, len vráti aj cudzie riadky. Testy ho nechytia tiež: sú na
 * čisté funkcie, bez databázy.
 *
 * Pravidlo je jednoduché: každý dopyt nad tabuľkou, ktorá patrí človeku,
 * musí mať vo svojom príkaze `.where(`. Tabuľky bez vlastného `userId`
 * (`habitEntries`, `taggables`, `subtasks`) sa filtrujú cez `innerJoin` na
 * vlastniacu tabuľku — aj to je `.where(`, takže pravidlo platí rovnako.
 *
 * Na rozdiel od `kontrola-dizajnu.mjs` je toto BRÁNA: pri náleze vracia
 * nenulový kód. Únik dát nie je vec vkusu.
 *
 * Vedomá výnimka sa označuje komentárom na riadku dopytu alebo nad ním:
 *
 *     // bez-filtra: <dôvod, prečo je to v poriadku>
 *
 * Spustenie:  npm run kontrola:dopyty
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const KOREN = "src";

/** Tabuľky, ktorých riadky patria konkrétnemu človeku. */
const TABULKY_POUZIVATELA = new Set([
  "tasks",
  "taskEvents",
  "subtasks",
  "ideas",
  "projects",
  "areas",
  "tags",
  "taggables",
  "habits",
  "habitEntries",
  "journal",
  "reviews",
  "templates",
  "templateTasks",
  "links",
  "settings",
]);

/** Značka vedomej výnimky. */
const VYNIMKA = /\/\/\s*bez-filtra:/;

function subory(priecinok, najdene = []) {
  for (const polozka of readdirSync(priecinok)) {
    const cesta = join(priecinok, polozka);
    if (statSync(cesta).isDirectory()) subory(cesta, najdene);
    else if (/\.tsx?$/.test(polozka)) najdene.push(cesta);
  }
  return najdene;
}

const nalezy = [];
let preverenych = 0;

for (const cesta of subory(KOREN)) {
  const relativna = relative(".", cesta).split(sep).join("/");
  const obsah = readFileSync(cesta, "utf8");
  const riadky = obsah.split(/\r?\n/);

  for (const zhoda of obsah.matchAll(/\.from\((\w+)\)/g)) {
    const tabulka = zhoda[1];
    if (!TABULKY_POUZIVATELA.has(tabulka)) continue;
    preverenych++;

    // Príkaz končí prvou bodkočiarkou za `.from(...)`.
    const koniec = obsah.indexOf(";", zhoda.index);
    const zaciatokRiadku = obsah.lastIndexOf("\n", zhoda.index) + 1;
    const prikaz = obsah.slice(zaciatokRiadku, koniec === -1 ? obsah.length : koniec);
    if (prikaz.includes(".where(")) continue;

    const cisloRiadku = obsah.slice(0, zhoda.index).split("\n").length;
    const tento = riadky[cisloRiadku - 1] ?? "";
    const predchadzajuci = riadky[cisloRiadku - 2] ?? "";
    if (VYNIMKA.test(tento) || VYNIMKA.test(predchadzajuci)) continue;

    nalezy.push(`${relativna}:${cisloRiadku}  .from(${tabulka}) bez .where()`);
  }
}

if (nalezy.length === 0) {
  console.log(`Dopyty sú filtrované — preverených ${preverenych}.`);
  process.exit(0);
}

console.log("DOPYT BEZ FILTRA PODĽA POUŽÍVATEĽA\n");
console.log("  Riadky týchto tabuliek patria konkrétnemu človeku. Dopyt bez");
console.log("  `.where(` vráti aj cudzie. Ak je to zámer, napíš nad riadok");
console.log("  komentár `// bez-filtra: <dôvod>`.\n");
for (const n of nalezy) console.log(`    ${n}`);
console.log(`\nSpolu ${nalezy.length} z ${preverenych} preverených.`);
process.exit(1);

/**
 * Kontrola, že žiadny dopyt nečíta cez používateľov.
 *
 * Toto je jediný invariant, na ktorom stojí to, že appku môžu používať dvaja
 * ľudia. Preklad ho nechytí — `db.select().from(tasks)` je typovo úplne
 * v poriadku, len vráti aj cudzie riadky. Testy ho nechytia tiež: sú na
 * čisté funkcie, bez databázy.
 *
 * Pravidlo je jednoduché: každý dopyt nad tabuľkou, ktorá patrí človeku,
 * musí mať vo svojom príkaze filter. Drizzle sa dá pýtať dvoma spôsobmi
 * a každý ho píše inak — staviteľ `.where(`, relačné API `where:`.
 * Kontrola pozná oba; keby poznala len jeden, strážila by menej, než
 * tvrdí, a to je horšie než keby nebola. Tabuľky bez vlastného `userId`
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
  /* Aj samotná tabuľka ľudí. `db.select().from(users)` bez filtra vypíše
     všetkých — a odkedy sú v appke dvaja, je to únik ako každý iný. */
  "users",
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

  /*
    Dva tvary dopytu, dva rôzne zápisy filtra.

    Drizzle sa dá pýtať dvoma spôsobmi a KAŽDÝ má vlastný filter:

        db.select().from(tasks).where(eq(tasks.userId, id))   // staviteľ
        db.query.tasks.findMany({ where: eq(...) })           // relačné API

    Kontrola dlho poznala len ten prvý. Relačné API nikdy nematchne `.from(`,
    takže mu prechádzalo úplne bokom — brána teda strážila menej, než tvrdila.
    To je horšie, než keby nebola: dáva falošnú istotu.
  */
  const tvary = [
    {
      vzor: /\.from\((\w+)\)/g,
      filter: ".where(",
      popis: (t) => `.from(${t}) bez .where()`,
    },
    {
      vzor: /\.query\.(\w+)\.(?:findFirst|findMany)\(/g,
      filter: "where:",
      popis: (t) => `db.query.${t}.find… bez where:`,
    },
  ];

  for (const tvar of tvary) {
    for (const zhoda of obsah.matchAll(tvar.vzor)) {
      const tabulka = zhoda[1];
      if (!TABULKY_POUZIVATELA.has(tabulka)) continue;
      preverenych++;

      // Príkaz končí prvou bodkočiarkou za zhodou.
      const koniec = obsah.indexOf(";", zhoda.index);
      const zaciatokRiadku = obsah.lastIndexOf("\n", zhoda.index) + 1;
      const prikaz = obsah.slice(zaciatokRiadku, koniec === -1 ? obsah.length : koniec);
      if (prikaz.includes(tvar.filter)) continue;

      const cisloRiadku = obsah.slice(0, zhoda.index).split("\n").length;
      const tento = riadky[cisloRiadku - 1] ?? "";
      const predchadzajuci = riadky[cisloRiadku - 2] ?? "";
      if (VYNIMKA.test(tento) || VYNIMKA.test(predchadzajuci)) continue;

      nalezy.push(`${relativna}:${cisloRiadku}  ${tvar.popis(tabulka)}`);
    }
  }
}

if (nalezy.length === 0) {
  console.log(`Dopyty sú filtrované — preverených ${preverenych}.`);
  process.exit(0);
}

console.log("DOPYT BEZ FILTRA PODĽA POUŽÍVATEĽA\n");
console.log("  Riadky týchto tabuliek patria konkrétnemu človeku. Dopyt bez");
console.log("  filtra vráti aj cudzie — `.where(` u staviteľa, `where:`");
console.log("  v relačnom API. Ak je to zámer, napíš nad riadok komentár");
console.log("  `// bez-filtra: <dôvod>`.\n");
for (const n of nalezy) console.log(`    ${n}`);
console.log(`\nSpolu ${nalezy.length} z ${preverenych} preverených.`);
process.exit(1);

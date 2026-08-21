/**
 * Kontrola dodržiavania dizajnového systému.
 *
 * Existuje preto, že tieto chyby **nechytí preklad ani testy**: sú to
 * reťazce v atribúte `className`, o ktorých TypeScript nič nevie. Prejavia
 * sa až okom v prehliadači, a to spravidla až na obrazovke, na ktorú sa
 * človek chvíľu nepozrel.
 *
 * Spustenie:  npm run kontrola:dizajn
 *
 * Nie je to linter s automatickou opravou — je to zoznam miest, kde sa
 * niekto (vrátane mňa) odchýlil od `docs/CONVENTIONS.md`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const KOREN = "src";

/** Čo hľadáme a prečo je to problém. */
const PRAVIDLA = [
  {
    nazov: "natvrdo zadaná tailwindová farba",
    vzor: /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    preco: "Farby patria výhradne do sémantických tokenov v globals.css.",
    // Palety oblastí a návykov sú používateľské dáta, nie dizajnové tokeny.
    vynimky: [/area-colors\.ts$/, /habit-colors\.ts$/, /area-dot\.tsx$/],
  },
  {
    nazov: "veľkosť písma mimo škály",
    vzor: /text-\[\d+(?:\.\d+)?px\]/g,
    preco: "Použi text-micro / text-mini / text-meta / text-body.",
    // Škála je tam definovaná a komentár ju cituje ako príklad.
    vynimky: [/globals\.css$/],
  },
  {
    nazov: "ručná záplata dotykového cieľa",
    vzor: /className="(?:h-11|size-11)\s+(?:sm|md):(?:h-\d|size-\d)"/g,
    preco: "Dotykový cieľ nesie primitív (Button, Input, Select), nie volajúci.",
    // Primitív o tej záplate píše vo vlastnom komentári.
    vynimky: [/ui\/button\.tsx$/],
  },
  {
    nazov: "výška spodnej lišty napísaná ručne",
    vzor: /3\.5rem\s*\+\s*env\(safe-area-inset-bottom\)/g,
    preco: "Použi var(--bar-inset).",
    vynimky: [/globals\.css$/],
  },
  {
    nazov: "ručne písaný štítok sekcie",
    vzor: /uppercase\s+tracking-(?:wide|wider|widest)/g,
    preco: "Použi utilitu .label a farbu dopíš zvlášť.",
  },
  {
    nazov: "tabular-nums bez font-mono",
    vzor: /"[^"]*\btabular-nums\b[^"]*"/g,
    preco: "Rovnaká šírka číslic platí len v rámci jedného písma.",
    kontrola: (zhoda) => !zhoda.includes("font-mono"),
  },
];

function subory(priecinok) {
  const najdene = [];
  for (const polozka of readdirSync(priecinok)) {
    const cesta = join(priecinok, polozka);
    if (statSync(cesta).isDirectory()) najdene.push(...subory(cesta));
    else if (/\.(tsx|ts|css)$/.test(polozka)) najdene.push(cesta);
  }
  return najdene;
}

let nalezov = 0;
const podlaPravidla = new Map();

for (const cesta of subory(KOREN)) {
  const relativna = relative(".", cesta).replace(/\\/g, "/");
  const obsah = readFileSync(cesta, "utf8");

  for (const pravidlo of PRAVIDLA) {
    if (pravidlo.vynimky?.some((v) => v.test(relativna))) continue;

    for (const zhoda of obsah.match(pravidlo.vzor) ?? []) {
      if (pravidlo.kontrola && !pravidlo.kontrola(zhoda)) continue;

      const riadok = obsah.slice(0, obsah.indexOf(zhoda)).split("\n").length;
      const zoznam = podlaPravidla.get(pravidlo.nazov) ?? [];
      zoznam.push(`${relativna}:${riadok}  ${zhoda.slice(0, 70)}`);
      podlaPravidla.set(pravidlo.nazov, zoznam);
      nalezov++;
    }
  }
}

if (nalezov === 0) {
  console.log("Dizajnový systém sa dodržiava — bez nálezov.");
  process.exit(0);
}

for (const pravidlo of PRAVIDLA) {
  const zoznam = podlaPravidla.get(pravidlo.nazov);
  if (!zoznam?.length) continue;
  console.log(`\n${pravidlo.nazov.toUpperCase()}  (${zoznam.length})`);
  console.log(`  ${pravidlo.preco}`);
  for (const riadok of zoznam.slice(0, 12)) console.log(`    ${riadok}`);
  if (zoznam.length > 12) console.log(`    … a ďalších ${zoznam.length - 12}`);
}

console.log(`\nSpolu ${nalezov} nálezov.`);
// Zámerne bez nenulového návratového kódu: je to prehľad, nie brána.
// Časť nálezov je legitímna výnimka a build kvôli nej padať nemá.
process.exit(0);

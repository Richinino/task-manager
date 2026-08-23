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
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const KOREN = "src";

/** Názov pravidla, ktoré si namiesto vzoru rieši vlastnú kontrolu nižšie. */
const UVODZOVKY = "slovenská úvodzovka zatvorená strojopisne";

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
    nazov: UVODZOVKY,
    /*
      Bez vzoru zámerne — toto pravidlo si rieši vlastnú kontrolu nižšie.

      Regulárny výraz to tu nezvládne. Rozlíšiť reťazec od komentára sa ním
      nedá: prvý pokus chytal aj vetu z komentára a druhý zase prepásol
      reťazec bez dosadenej hodnoty. Preto sa súbor naozaj rozoberie
      parserom TypeScriptu a hľadá sa len v tom, čo je naozaj reťazec.
    */
    vlastnaKontrola: true,
    preco: 'Slovenská dvojica je „…“, nie „…". ESLint chytí len text v JSX.',
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

function pridaj(nazov, riadok) {
  const zoznam = podlaPravidla.get(nazov) ?? [];
  zoznam.push(riadok);
  podlaPravidla.set(nazov, zoznam);
  nalezov++;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ÚVODZOVKY

   Slovenská dvojica je „…“ — dole otváracia, hore zatváracia. Strojopisné `"`
   v texte appky nepatria.

   Hľadá sa len v tom, čo je naozaj reťazec — komentáre nikto nevykresľuje
   a opravovať ich netreba. Pokrýva všetky tvary naraz: `"…"`, `'…'`,
   `` `…` ``, šablónu s dosadenou hodnotou aj holý text v JSX.
   ═══════════════════════════════════════════════════════════════════════════ */

const OTVARACIA = "„";
const ZATVARACIA = "“";

/**
 * Text súboru, v ktorom je vidieť LEN obsah reťazcov — všetko ostatné sa
 * nahradí medzerami. Čísla riadkov ostávajú sedieť.
 *
 * Prečo takto:
 *
 * 1. **Komentáre musia vypadnúť.** Vetu z komentára nikto nevykresľuje,
 *    takže opravovať ju netreba — a v tomto projekte ich sú stovky.
 * 2. **Šablóna s dosadenou hodnotou sa nesmie roztrhnúť.** V zápise
 *    `Projekt „${meno}" neexistuje.` leží otváracia úvodzovka v jednom
 *    uzle a zatváracia v druhom. Keby sa uzly kontrolovali samostatne,
 *    dvojica by sa nikdy nestretla — a pritom je to najčastejší tvar.
 *    Tu ostávajú obe na svojich miestach a zmizne len to medzi nimi.
 *
 * Surový skener na to nestačil: bez parsera stráca na JSX synchronizáciu
 * a z komentárov našiel sotva desatinu.
 */
function ibaRetazce(cesta, obsah) {
  const zdroj = ts.createSourceFile(
    cesta,
    obsah,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  // Prázdne plátno, do ktorého sa vrátia len reťazce.
  const znaky = new Array(obsah.length);
  for (let i = 0; i < obsah.length; i++) {
    const z = obsah[i];
    znaky[i] = z === "\n" || z === "\r" ? z : " ";
  }

  const jeRetazec = (node) =>
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node) ||
    ts.isJsxText(node);

  const prejdi = (node) => {
    if (jeRetazec(node)) {
      const od = node.getStart(zdroj);
      const po = node.getEnd();
      for (let i = od; i < po; i++) znaky[i] = obsah[i];
    }
    ts.forEachChild(node, prejdi);
  };
  prejdi(zdroj);

  return znaky.join("");
}

function skontrolujUvodzovky(cesta, relativna, obsah) {
  const text = ibaRetazce(cesta, obsah);
  let od = 0;

  while (true) {
    const otvor = text.indexOf(OTVARACIA, od);
    if (otvor === -1) break;

    const strojopisna = text.indexOf('"', otvor);
    const spravna = text.indexOf(ZATVARACIA, otvor);
    // Nález len vtedy, keď je strojopisná bližšie než správna.
    if (strojopisna !== -1 && (spravna === -1 || strojopisna < spravna)) {
      const riadok = text.slice(0, otvor).split("\n").length;
      const ukazka = text.slice(otvor, strojopisna + 1).replace(/\s+/g, " ");
      pridaj(UVODZOVKY, `${relativna}:${riadok}  ${ukazka.slice(0, 60)}`);
      od = strojopisna + 1;
    } else {
      od = otvor + 1;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEH
   ═══════════════════════════════════════════════════════════════════════════ */

for (const cesta of subory(KOREN)) {
  const relativna = relative(".", cesta).split(sep).join("/");
  const obsah = readFileSync(cesta, "utf8");

  for (const pravidlo of PRAVIDLA) {
    if (pravidlo.vlastnaKontrola) continue;
    if (pravidlo.vynimky?.some((v) => v.test(relativna))) continue;

    for (const zhoda of obsah.match(pravidlo.vzor) ?? []) {
      if (pravidlo.kontrola && !pravidlo.kontrola(zhoda)) continue;

      const riadok = obsah.slice(0, obsah.indexOf(zhoda)).split("\n").length;
      pridaj(pravidlo.nazov, `${relativna}:${riadok}  ${zhoda.slice(0, 70)}`);
    }
  }

  if (/\.tsx?$/.test(cesta)) skontrolujUvodzovky(cesta, relativna, obsah);
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

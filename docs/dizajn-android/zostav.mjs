// Zloží stránku z kostry a ukážok obrazoviek.
// Každá ukážka ide do vlastného shadow DOM (deklaratívny <template>), takže
// si ich CSS navzájom nezavadzia. Odkazy na Google Fonts sa vyťahujú von,
// lebo @font-face vnútri shadow rootu prehliadač nezaregistruje.
//
// Kostra má zástupky <!--FILE:meno--> → vloží sa meno.html.
// (Staršie <!--VARIANT-A--> znamená FILE:variant-a.)
//
// Spustenie: node docs/dizajn-android/zostav.mjs [kostra]   (predvolene „uvod")
//   uvod → uvod.shell.html → uvod.html
//   c    → c.shell.html    → c.html
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? "uvod";
let out = readFileSync(join(dir, `${name}.shell.html`), "utf8");

// Rám telefónu sa dopĺňa do každej ukážky — stránka okolo ho vidieť nemôže.
const FRAME = `<style>
.screens{display:flex!important;flex-wrap:wrap;gap:36px!important;padding:14px!important;justify-content:center}
.screen{border-radius:34px!important;box-shadow:0 0 0 10px #17171c,0 0 0 11px #3b3b44,0 30px 60px -30px rgba(0,0,0,.6)!important;flex:none}
</style>`;

const links = new Set();
out = out.replace(/<!--VARIANT-([A-Z])-->/g, (_, k) => `<!--FILE:variant-${k.toLowerCase()}-->`);
out = out.replace(/<!--FILE:([\w-]+)-->/g, (_, file) => {
  const path = join(dir, `${file}.html`);
  let html = existsSync(path)
    ? readFileSync(path, "utf8")
    : `<div class="screens"><p style="font:14px sans-serif">Ukážka ${file} ešte nie je hotová.</p></div>`;
  html = html.replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g, (m) => {
    links.add(m);
    return "";
  });
  return `<div class="phones"><template shadowrootmode="open">${html}${FRAME}</template></div>`;
});

out = out.replace("<!--FONTS-->", [...links].join("\n"));
writeFileSync(join(dir, `${name}.html`), out);
console.log(`${name}.html: ${(out.length / 1024).toFixed(0)} kB, písma ${links.size}`);

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * Konfigurácia ESLintu.
 *
 * Vznikla neskoro: `eslint` aj `eslint-config-next` boli v `package.json`
 * od začiatku a skript `npm run lint` tiež, ale konfiguračný súbor nikdy —
 * takže lint v tomto projekte v skutočnosti **nikdy nebežal** a padal na
 * „ESLint couldn't find an eslint.config file". Celá trieda kontrol, ktoré
 * `tsc` nerobí (závislosti hookov, pravidlá Next.js, prístupnosť), tu roky
 * chýbala.
 *
 * Sada `core-web-vitals` je odporúčaná pre bežné projekty a dvíha pravidlá
 * s dopadom na Core Web Vitals z varovania na chybu.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,

  /*
    Prístupnosť naplno.

    `eslint-config-next` zapína z `jsx-a11y` len šesť pravidiel. Táto appka je
    ale keyboard-first a `docs/CONVENTIONS.md` má na prístupnosť vlastnú
    sekciu, takže tu dáva zmysel celá odporúčaná sada — o tridsať pravidiel
    viac, ktoré strážia veci ako klikateľný `<div>` bez roly a klávesnice,
    obrázok bez alternatívy alebo popis, ktorý neukazuje na svoje pole.
  */
  {
    // Plugin registruje `eslint-config-next`, preto sa preberajú LEN pravidlá.
    // Znovu ho vyhlásiť sa nedá: „Cannot redefine plugin".
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },

  // Prepisuje predvolené ignorovanie z eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Lokálna databáza PGlite — vygenerované súbory, nie zdroj.
    ".data/**",
    // Pracovné kópie repozitára od agentov. Bez tohto lint prechádza
    // celý zdroj toľkokrát, koľko kópií tam práve leží, a počty nálezov
    // sú násobkom skutočnosti.
    ".claude/**",
  ]),
]);

export default eslintConfig;

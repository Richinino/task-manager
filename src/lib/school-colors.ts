/**
 * Farby školských predmetov.
 *
 * Paleta je **tá istá ako pri oblastiach a návykoch** (`AREA_COLOR_OPTIONS`) —
 * jedno miesto, kde sú farby naozaj zapísané. Druhá paleta by znamenala dva
 * zoznamy, ktoré sa časom rozídu, a rozvrh by v appke pôsobil ako cudzí prvok.
 *
 * ## Prečo nie farby z EduPage
 *
 * EduPage svoje farby má, ale sú to bledé pastely ladené na bielu tabuľku
 * v prehliadači. V tmavej téme tejto appky by boli takmer neviditeľné a vedľa
 * oblastí by pôsobili ako z inej appky. Prekresľujú sa preto na paletu appky.
 *
 * ## Ako je poradie zvolené
 *
 * Nie abecedne a nie náhodne. Príbuzné predmety dostali príbuzné odtiene
 * (jazyky modré, prírodovedné zelené a azúrové), ale **predmety, ktoré stoja
 * v rozvrhu vedľa seba, sa musia dať rozoznať** — inak z mriežky vznikne
 * farebná kaša. Preto sú napríklad umenie (žltá) a fyzika (jantárová)
 * v utorku oddelené geografiou (purpurová).
 */
import { AREA_COLOR_OPTIONS } from "@/components/views/oblasti/area-colors";

/**
 * Skratka predmetu → farba z palety.
 *
 * Kľúče sú skratky tak, ako ich dodáva zdroj — vrátane `BIO lab` s medzerou.
 * Porovnáva sa bez ohľadu na veľkosť písmen, lebo iná škola môže písať `bio`.
 */
const PODLA_SKRATKY: Record<string, string> = {
  /* Jazyky — modrá rodina, navzájom odlíšené sýtosťou. */
  anj: "sky",
  nej: "indigo",
  sjl: "rose",

  /* Prírodovedné. */
  mat: "blue",
  fyz: "amber",
  che: "cyan",
  "che lab": "teal",
  bio: "emerald",
  "bio lab": "lime",
  inf: "green",

  /* Spoločenskovedné. */
  dej: "violet",
  geg: "purple",
  obn: "fuchsia",
  ukl: "yellow",

  /* Telesná — jediná, ktorá je pohyb, tak nech je aj vidieť. */
  tsv: "red",
};

/**
 * Poradie, v akom sa farby prideľujú predmetom mimo zoznamu.
 *
 * Výrazné, navzájom rozoznateľné odtiene rozhádzané po farebnom kruhu — aby
 * dva neznáme predmety vedľa seba nedostali dva odtiene tej istej farby.
 */
const NAHRADNE: readonly string[] = [
  "sky",
  "amber",
  "emerald",
  "violet",
  "rose",
  "teal",
  "orange",
  "indigo",
  "lime",
  "fuchsia",
  "cyan",
  "red",
];

/**
 * Farba pre predmet. Neznámy dostane prvú voľnú z náhradného poradia.
 *
 * `pouzite` sú farby, ktoré už iné predmety majú — vďaka nim nedostanú dva
 * predmety tú istú farbu, kým je z čoho vyberať. Keď sa paleta minie, farba
 * sa zopakuje: opakovaná farba je menšie zlo než zlyhanie importu.
 */
export function subjectColor(code: string, pouzite: readonly string[] = []): string {
  const kluc = code.trim().toLowerCase();
  const znama = PODLA_SKRATKY[kluc];
  if (znama !== undefined) return znama;

  const volna = NAHRADNE.find((farba) => !pouzite.includes(farba));
  if (volna !== undefined) return volna;

  const zvysok = AREA_COLOR_OPTIONS.find((o) => !pouzite.includes(o.value));
  return zvysok?.value ?? "slate";
}

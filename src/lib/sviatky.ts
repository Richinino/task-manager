/**
 * Slovenské štátne sviatky a dni pracovného pokoja.
 *
 * Sú to jediné voľná, ktoré sa dajú **vypočítať**. Školské prázdniny
 * (jesenné, vianočné, jarné) určuje ministerstvo, líšia sa podľa kraja
 * a menia sa každý rok — tie musí človek zadať sám. Hádať ich by znamenalo
 * tvrdiť niečo, čo nevieme, a termín domácej úlohy by potom padol na deň,
 * keď škola je.
 *
 * ## Prečo to appka potrebuje
 *
 * Odber rozvrhu z EduPage je **rozvrh natiahnutý na dátumy, nie denný plán** —
 * sviatky v ňom nie sú vynechané. Overené na skutočnom feede: 15. 9. aj
 * 17. 11. 2026 sú štátne sviatky a feed na nich má plných osem hodín. Bez
 * tohto zoznamu by appka na Sedembolestnú tvrdila, že máš celý deň školu.
 */

/** Sviatok s pevným dátumom — deň a mesiac sa nemenia. */
const PEVNE: readonly { mesiac: number; den: number; nazov: string }[] = [
  { mesiac: 1, den: 1, nazov: "Deň vzniku Slovenskej republiky" },
  { mesiac: 1, den: 6, nazov: "Zjavenie Pána" },
  { mesiac: 5, den: 1, nazov: "Sviatok práce" },
  { mesiac: 5, den: 8, nazov: "Deň víťazstva nad fašizmom" },
  { mesiac: 7, den: 5, nazov: "Sviatok svätého Cyrila a Metoda" },
  { mesiac: 8, den: 29, nazov: "Výročie SNP" },
  { mesiac: 9, den: 1, nazov: "Deň Ústavy Slovenskej republiky" },
  { mesiac: 9, den: 15, nazov: "Sedembolestná Panna Mária" },
  { mesiac: 11, den: 1, nazov: "Sviatok všetkých svätých" },
  { mesiac: 11, den: 17, nazov: "Deň boja za slobodu a demokraciu" },
  { mesiac: 12, den: 24, nazov: "Štedrý deň" },
  { mesiac: 12, den: 25, nazov: "Prvý sviatok vianočný" },
  { mesiac: 12, den: 26, nazov: "Druhý sviatok vianočný" },
];

export interface Sviatok {
  /** `RRRR-MM-DD`. */
  date: string;
  nazov: string;
}

function iso(rok: number, mesiac: number, den: number): string {
  return `${rok}-${String(mesiac).padStart(2, "0")}-${String(den).padStart(2, "0")}`;
}

/**
 * Veľkonočná nedeľa v gregoriánskom kalendári.
 *
 * Takzvaný anonymný gregoriánsky algoritmus. Nie je to pekné čítanie a ani
 * nemá byť — je to prepis cirkevného pravidla („prvá nedeľa po prvom splne
 * po jarnej rovnodennosti") do aritmetiky. Meniť sa v ňom nedá nič, len
 * pokaziť, preto je zabalený tu a overený testom na známych rokoch.
 */
function velkonocnaNedela(rok: number): { mesiac: number; den: number } {
  const a = rok % 19;
  const b = Math.floor(rok / 100);
  const c = rok % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);

  const mesiac = Math.floor((h + l - 7 * m + 114) / 31);
  const den = ((h + l - 7 * m + 114) % 31) + 1;
  return { mesiac, den };
}

function posun(rok: number, mesiac: number, den: number, oDni: number): string {
  const d = new Date(Date.UTC(rok, mesiac - 1, den));
  d.setUTCDate(d.getUTCDate() + oDni);
  return d.toISOString().slice(0, 10);
}

/**
 * Sviatky v jednom kalendárnom roku, zoradené podľa dátumu.
 *
 * Sú tu aj tie, ktoré padnú na víkend. Vyhadzovať ich by znamenalo rozhodovať
 * za používateľa — a hlavne by to nič neušetrilo: deň bez hodín v rozvrhu
 * jednoducho nie je vidieť.
 */
export function slovenskeSviatky(rok: number): Sviatok[] {
  const velka = velkonocnaNedela(rok);

  const sviatky: Sviatok[] = [
    ...PEVNE.map((s) => ({ date: iso(rok, s.mesiac, s.den), nazov: s.nazov })),
    {
      date: posun(rok, velka.mesiac, velka.den, -2),
      nazov: "Veľký piatok",
    },
    {
      date: posun(rok, velka.mesiac, velka.den, 1),
      nazov: "Veľkonočný pondelok",
    },
  ];

  return sviatky.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Sviatky školského roka, teda od septembra do augusta.
 *
 * Školský rok sedí na dvoch kalendárnych, takže „sviatky roka 2026" by
 * vynechali všetko od januára — vrátane Veľkej noci, čo je najdlhšie voľno
 * v druhom polroku.
 */
export function sviatkySkolskehoRoka(zaciatocnyRok: number): Sviatok[] {
  const od = `${zaciatocnyRok}-09-01`;
  const do_ = `${zaciatocnyRok + 1}-08-31`;

  return [...slovenskeSviatky(zaciatocnyRok), ...slovenskeSviatky(zaciatocnyRok + 1)]
    .filter((s) => s.date >= od && s.date <= do_)
    .sort((a, b) => a.date.localeCompare(b.date));
}

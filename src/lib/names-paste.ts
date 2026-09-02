/**
 * Čítanie dvojíc „skratka — celé meno" z vloženého textu.
 *
 * Rozvrh z EduPage dodáva len skratky (`ANJ`, `LIN`). Celé názvy v ňom nie sú
 * vôbec, takže sa dopĺňajú ručne — a pri pätnástich predmetoch a pätnástich
 * vyučujúcich je vypisovanie po jednom políčku tridsať zbytočných krokov.
 *
 * Preto sa dá vložiť celý zoznam naraz. Čistá funkcia nad textom, bez siete
 * a bez databázy, aby sa dali otestovať práve tie tvary, v akých to ľudia
 * naozaj vkladajú.
 */

/** Jedna dvojica. `code` je skratka zo zdroja, `name` to, čo sa doplní. */
export interface NamePair {
  code: string;
  name: string;
}

/**
 * Riadky, ktoré sú zjavne hlavička tabuľky, nie dáta.
 *
 * Kto vloží CSV z Excelu, vloží ho aj s prvým riadkom — a „skratka" nie je
 * skratka predmetu. Bez tohto by vznikla snaha pomenovať predmet `skratka`
 * a človek by dostal hlásenie o neznámej skratke, ktoré nič nevysvetľuje.
 */
const HLAVICKY = new Set(["skratka", "kod", "kód", "code", "predmet", "ucitel", "učiteľ"]);

/**
 * Rozdelí riadok na skratku a meno.
 *
 * Berie bodkočiarku, tabulátor aj čiarku — bodkočiarku píše slovenský Excel,
 * tabulátor vznikne kopírovaním z tabuľky a čiarku má bežné CSV. Delí sa
 * **na prvom** oddeľovači: meno môže obsahovať čiarku („Mgr. Jana Nová, PhD."),
 * skratka nikdy.
 */
function rozdel(riadok: string): NamePair | null {
  const zhoda = /^([^;\t,]+)[;\t,]\s*(.*)$/.exec(riadok);
  if (zhoda === null) return null;

  const code = (zhoda[1] ?? "").trim();
  /* Ďalšie stĺpce (farba, poznámka) sa zahodia — berie sa len prvé meno. */
  const name = (zhoda[2] ?? "").split(/[;\t]/)[0]?.trim() ?? "";

  if (code === "" || name === "") return null;
  if (HLAVICKY.has(code.toLowerCase())) return null;

  return { code, name };
}

/**
 * Prečíta vložený text na dvojice.
 *
 * Prázdne riadky a riadky bez mena sa preskočia — v CSV, kde je vyplnená len
 * časť, je prázdna hodnota „ešte som nedoplnil", nie „vymaž meno". Mazanie
 * mena patrí do políčka, nie do hromadného vkladania.
 *
 * Pri dvoch riadkoch s tou istou skratkou vyhráva **posledný**: keď človek
 * niečo opraví a vloží znova, myslí tú opravu.
 */
export function parseNamePairs(text: string): NamePair[] {
  const podlaKodu = new Map<string, string>();

  for (const riadok of text.split(/\r?\n/)) {
    const dvojica = rozdel(riadok.trim());
    if (dvojica !== null) podlaKodu.set(dvojica.code, dvojica.name);
  }

  return [...podlaKodu].map(([code, name]) => ({ code, name }));
}

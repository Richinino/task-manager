import { fold } from "@/lib/fold";

/**
 * Projekt podľa mena napísaného za `+` v rýchlom zachytení.
 *
 * Projekt sa volá tak, ako ho človek pomenoval: „3D tlačiareň", s medzerou
 * aj diakritikou. Značka `+` pritom bez zoznamu projektov končí na prvej
 * medzere, takže `+3D tlaciaren` znamenalo projekt „3D" a „tlaciaren" ostalo
 * v názve úlohy. Parser zoznam projektov poznať môže (klient ho má kvôli
 * našepkávaniu, server v databáze) a podľa neho značku natiahne na celé meno.
 *
 * Pravidlá porovnávania:
 * - diakritika ani veľké písmená nerozhodujú („tlaciaren" = „Tlačiareň"),
 * - medzera, spojovník a podčiarkovník sú to isté („3D-tlaciaren"),
 * - vyhráva najdlhšie meno, takže pri projektoch „3D" aj „3D tlačiareň"
 *   rozhodne to, čo je naozaj napísané,
 * - meno musí skončiť na hranici slova — „+3Dx" nie je projekt „3D".
 *
 * Čistá funkcia bez databázy, beží na klientovi aj na serveri rovnako.
 */

/** Oddeľovač slov v mene projektu. */
const SEPARATOR = /^[\s_-]+/u;

/** Písmeno alebo číslica — za menom projektu nesmie pokračovať slovo. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** „3D  Tlačiareň" → „3d tlaciaren". Kľúč, podľa ktorého sa mená porovnávajú. */
export function projectKey(name: string): string {
  return fold(name).replace(/[\s_-]+/gu, " ").trim();
}

/** Projekt s rovnakým menom podľa `projectKey`, alebo `undefined`. */
export function findProject<T extends { name: string }>(
  name: string,
  projects: readonly T[],
): T | undefined {
  const key = projectKey(name);
  if (key === "") return undefined;
  return projects.find((project) => projectKey(project.name) === key);
}

/**
 * Existuje projekt s týmto menom?
 *
 * Náhľad zachytenia porovnáva **presne tak, ako to robí server** v
 * `quickCapture` (`findProject`). Keby sa rozišli, náhľad by tvrdil, že
 * „+praca" projekt nájde, a úloha by sa uložila bez neho — čo je horšie než
 * nevarovať vôbec.
 */
export function projectExists(name: string, known: readonly string[]): boolean {
  return findProject(name, known.map((candidate) => ({ name: candidate }))) !== undefined;
}

/**
 * Najdlhší projekt, ktorého meno v `text` začína presne na `start` (hneď za
 * `+`). Vráti jeho meno tak, ako je uložené, a index za koncom zhody.
 */
export function matchProjectAt(
  text: string,
  start: number,
  names: readonly string[],
): { name: string; end: number } | null {
  let best: { name: string; end: number } | null = null;

  for (const name of names) {
    const end = matchEnd(text, start, projectKey(name));
    if (end !== null && (best === null || end > best.end)) {
      best = { name: name.trim(), end };
    }
  }

  return best;
}

function matchEnd(text: string, start: number, key: string): number | null {
  if (key === "") return null;

  let position = start;
  const words = key.split(" ");
  for (let index = 0; index < words.length; index += 1) {
    if (index > 0) {
      const separator = SEPARATOR.exec(text.slice(position));
      if (separator === null) return null;
      position += separator[0].length;
    }
    const word = words[index]!;
    if (fold(text.slice(position, position + word.length)) !== word) return null;
    position += word.length;
  }

  const next = text[position];
  if (next !== undefined && WORD_CHAR.test(next)) return null;
  return position;
}

/**
 * Spárovanie hodiny zo zdroja s tou, ktorá je už uložená.
 *
 * ## Prečo to nie je len kľúč slotu
 *
 * Jedinečný index v schéme je `(user, dátum, poradie, predmet)` — predmet je
 * jeho súčasťou, lebo delené skupiny dávajú na tú istú hodinu dva rôzne
 * predmety naraz (`sepB Chlapci` a `lab 1.sk`).
 *
 * Lenže ručné suplovanie **prepíše predmet** na ten, čo naozaj bude. Hodina,
 * ktorú si opravil, tým z pohľadu slotu zmizne: import ju nenájde, založí ju
 * znova a mazanie ju nezmaže, lebo ručné riadky preskakuje. Zostane ti tá
 * istá hodina dvakrát — navždy, lebo pri každom ďalšom behu už je tá nová
 * „videná" — a rozpočet dňa ju dvakrát odráta.
 *
 * Preto sa hľadá **najprv podľa `UID` zo zdroja**. Má tvar
 * `2026-09-02:6bb02a0f_3@…`, teda dátum a poradie hodiny; je jedinečné pre
 * každú hodinu a ručnú zmenu predmetu prežije. Zhoda podľa neho zároveň
 * znamená, že sedí dátum aj poradie — zmeniť sa môže len predmet, a to je
 * práve suplovanie zapísané priamo do odberu.
 *
 * Slot ostáva ako záloha: riadky uložené predtým, než sa `UID` začalo
 * zapisovať, ho nemajú a spárovať sa musia tiež.
 */

export interface StoredLesson {
  id: string;
  date: string;
  period: number;
  subjectId: string;
  sourceUid: string | null;
  manual: boolean;
}

/** Kľúč slotu. Musí sedieť s jedinečným indexom v schéme. */
export function slotKey(date: string, period: number, subjectId: string): string {
  return `${date}|${period}|${subjectId}`;
}

/**
 * Postaví vyhľadávanie nad uloženými hodinami.
 *
 * Pri zhode `UID` má prednosť **ručný riadok**: je jedinou pravdou o tom, čo
 * sa v ten deň naozaj deje, a keby vyhral riadok vyrobený zdrojom, import by
 * prepísal práve to, čo si zapísal sám.
 */
export function lessonMatcher<T extends StoredLesson>(
  ulozene: readonly T[],
): (uid: string, key: string) => T | undefined {
  const podlaUid = new Map<string, T>();
  for (const h of [...ulozene].sort((a, b) => Number(b.manual) - Number(a.manual))) {
    const uid = h.sourceUid ?? "";
    if (uid !== "" && !podlaUid.has(uid)) podlaUid.set(uid, h);
  }

  const podlaKluca = new Map<string, T>();
  for (const h of ulozene) {
    const k = slotKey(h.date, h.period, h.subjectId);
    if (!podlaKluca.has(k)) podlaKluca.set(k, h);
  }

  return (uid, key) =>
    (uid === "" ? undefined : podlaUid.get(uid)) ?? podlaKluca.get(key);
}

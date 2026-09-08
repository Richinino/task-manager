import { describe, expect, it } from "vitest";

import { lessonMatcher, slotKey, type StoredLesson } from "@/lib/school-pairing";

/* Uložená hodina s rozumnými predvolenými hodnotami — test píše len to, o čo mu ide. */
function hodina(over: Partial<StoredLesson> & { id: string }): StoredLesson {
  return {
    date: "2026-09-10",
    period: 3,
    subjectId: "dej",
    sourceUid: "2026-09-10:6bb02a0f_3@skola.edupage.org",
    manual: false,
    ...over,
  };
}

describe("lessonMatcher", () => {
  it("nájde hodinu podľa slotu, keď sa nič nezmenilo", () => {
    const ulozena = hodina({ id: "a" });
    const najdi = lessonMatcher([ulozena]);

    expect(najdi(ulozena.sourceUid ?? "", slotKey("2026-09-10", 3, "dej"))).toBe(ulozena);
  });

  /*
    Toto je ten prípad, kvôli ktorému modul vznikol. Ručné suplovanie prepíše
    predmet, takže kľúč slotu prestane sedieť — a keby sa hľadalo len podľa
    neho, import by hodinu založil znova a mal by si ju v rozvrhu dvakrát.
  */
  it("nájde ručne presuplovanú hodinu, hoci sa jej zmenil predmet", () => {
    const presuplovana = hodina({ id: "a", subjectId: "sjl", manual: true });
    const najdi = lessonMatcher([presuplovana]);

    /* Odber o suplovaní nevie, nesie stále pôvodný predmet. */
    const zoZdroja = najdi(
      "2026-09-10:6bb02a0f_3@skola.edupage.org",
      slotKey("2026-09-10", 3, "dej"),
    );

    expect(zoZdroja).toBe(presuplovana);
  });

  it("pri zhode UID vyhrá ručný riadok", () => {
    const zoZdroja = hodina({ id: "zdroj" });
    const rucny = hodina({ id: "rucny", subjectId: "sjl", manual: true });
    const najdi = lessonMatcher([zoZdroja, rucny]);

    expect(
      najdi("2026-09-10:6bb02a0f_3@skola.edupage.org", slotKey("2026-09-10", 3, "dej")),
    ).toBe(rucny);
  });

  it("padne späť na slot, keď riadok UID nemá", () => {
    const stara = hodina({ id: "a", sourceUid: null });
    const najdi = lessonMatcher([stara]);

    expect(najdi("2026-09-10:6bb02a0f_3@skola.edupage.org", slotKey("2026-09-10", 3, "dej"))).toBe(
      stara,
    );
  });

  it("padne späť na slot, keď zdroj UID neposlal", () => {
    const stara = hodina({ id: "a" });
    const najdi = lessonMatcher([stara]);

    expect(najdi("", slotKey("2026-09-10", 3, "dej"))).toBe(stara);
  });

  it("nenájde nič, keď hodina ani slot nesedia", () => {
    const najdi = lessonMatcher([hodina({ id: "a" })]);

    expect(najdi("2026-09-11:iny_4@skola.edupage.org", slotKey("2026-09-11", 4, "mat"))).toBe(
      undefined,
    );
  });

  /*
    Delené skupiny dávajú na tú istú hodinu dva predmety naraz. Bez predmetu
    v kľúči by si jedna druhú prepísali.
  */
  it("rozlíši dve delené hodiny v tom istom slote", () => {
    const chlapci = hodina({
      id: "a",
      subjectId: "tsv",
      sourceUid: "2026-09-10:aaa_3@skola.edupage.org",
    });
    const dievcata = hodina({
      id: "b",
      subjectId: "lab",
      sourceUid: "2026-09-10:bbb_3@skola.edupage.org",
    });
    const najdi = lessonMatcher([chlapci, dievcata]);

    expect(najdi("2026-09-10:aaa_3@skola.edupage.org", slotKey("2026-09-10", 3, "tsv"))).toBe(
      chlapci,
    );
    expect(najdi("2026-09-10:bbb_3@skola.edupage.org", slotKey("2026-09-10", 3, "lab"))).toBe(
      dievcata,
    );
  });
});

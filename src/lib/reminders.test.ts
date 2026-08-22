import { describe, expect, it } from "vitest";

import {
  MAX_MESKANIE_MIN,
  casPripomienky,
  jeNaOdoslanie,
  jePremeskana,
  naOdoslanie,
  type Pripomienka,
  type UlohaSCasom,
} from "./reminders";

const BA = "Europe/Bratislava";

/** Úloha bez akéhokoľvek času — testy si dosadia len to, čo skúšajú. */
const PRAZDNA: UlohaSCasom = {
  plannedDate: null,
  plannedTime: null,
  dueDate: null,
  dueTime: null,
};

function pripomienka(cast: Partial<Pripomienka> & { at: Date }): Pripomienka {
  return { id: "p1", sentAt: null, ...cast };
}

const min = (n: number): number => n * 60_000;

describe("casPripomienky", () => {
  it("berie naplánovaný čas, nie termín", () => {
    const out = casPripomienky(
      {
        ...PRAZDNA,
        plannedDate: "2026-08-22",
        plannedTime: "09:30",
        dueDate: "2026-08-25",
        dueTime: "17:00",
      },
      BA,
    );
    expect(out?.toISOString()).toBe("2026-08-22T07:30:00.000Z");
  });

  it("keď naplánovaný čas nie je, siahne po termíne", () => {
    const out = casPripomienky(
      { ...PRAZDNA, plannedDate: "2026-08-22", dueDate: "2026-08-25", dueTime: "17:00" },
      BA,
    );
    expect(out?.toISOString()).toBe("2026-08-25T15:00:00.000Z");
  });

  /*
    Deň bez hodiny by znamenal polnoc — a to nie je čas, kedy chce byť
    niekto vyrušený. Radšej žiadna pripomienka než pripomienka o polnoci.
  */
  it("úloha bez hodiny pripomienku nedostane", () => {
    expect(casPripomienky({ ...PRAZDNA, plannedDate: "2026-08-22" }, BA)).toBeNull();
    expect(casPripomienky({ ...PRAZDNA, dueDate: "2026-08-22" }, BA)).toBeNull();
    expect(casPripomienky(PRAZDNA, BA)).toBeNull();
  });

  it("hodina bez dňa tiež nie", () => {
    expect(casPripomienky({ ...PRAZDNA, plannedTime: "09:30" }, BA)).toBeNull();
    expect(casPripomienky({ ...PRAZDNA, dueTime: "09:30" }, BA)).toBeNull();
  });

  it("predstih posúva dozadu", () => {
    const out = casPripomienky(
      { ...PRAZDNA, plannedDate: "2026-08-22", plannedTime: "09:30" },
      BA,
      15,
    );
    expect(out?.toISOString()).toBe("2026-08-22T07:15:00.000Z");
  });

  it("predstih cez polnoc prejde do predošlého dňa", () => {
    const out = casPripomienky(
      { ...PRAZDNA, plannedDate: "2026-08-22", plannedTime: "00:15" },
      BA,
      30,
    );
    expect(out?.toISOString()).toBe("2026-08-21T21:45:00.000Z");
  });

  it("nezmyselný predstih sa berie ako nula", () => {
    const zaklad = { ...PRAZDNA, plannedDate: "2026-08-22", plannedTime: "09:30" };
    const cakane = "2026-08-22T07:30:00.000Z";
    expect(casPripomienky(zaklad, BA, -60)?.toISOString()).toBe(cakane);
    expect(casPripomienky(zaklad, BA, Number.NaN)?.toISOString()).toBe(cakane);
    expect(casPripomienky(zaklad, BA, Number.POSITIVE_INFINITY)?.toISOString()).toBe(cakane);
  });

  it("zimný a letný čas dávajú iný okamih pri rovnakej hodine", () => {
    const leto = casPripomienky(
      { ...PRAZDNA, plannedDate: "2026-08-22", plannedTime: "09:00" },
      BA,
    );
    const zima = casPripomienky(
      { ...PRAZDNA, plannedDate: "2026-01-22", plannedTime: "09:00" },
      BA,
    );
    expect(leto?.toISOString()).toBe("2026-08-22T07:00:00.000Z");
    expect(zima?.toISOString()).toBe("2026-01-22T08:00:00.000Z");
  });

  it("pokazené pásmo nezhodí plánovač", () => {
    expect(
      casPripomienky({ ...PRAZDNA, plannedDate: "2026-08-22", plannedTime: "09:30" }, "Nikde/Nikde"),
    ).toBeNull();
  });
});

describe("jeNaOdoslanie", () => {
  const teraz = new Date("2026-08-22T10:00:00.000Z");

  it("dozretá a neodoslaná ide von", () => {
    expect(jeNaOdoslanie(pripomienka({ at: new Date(teraz.getTime() - min(1)) }), teraz)).toBe(true);
  });

  it("presne teraz ide von", () => {
    expect(jeNaOdoslanie(pripomienka({ at: new Date(teraz) }), teraz)).toBe(true);
  });

  /*
    Radšej neskoro než skoro: „o chvíľu ti začína porada" pätnásť minút
    predtým, než to je pravda, človeka naučí notifikáciám neveriť.
  */
  it("budúca nejde von ani o minútu skôr", () => {
    expect(jeNaOdoslanie(pripomienka({ at: new Date(teraz.getTime() + min(1)) }), teraz)).toBe(false);
  });

  it("už odoslaná sa neposiela druhýkrát", () => {
    expect(
      jeNaOdoslanie(
        pripomienka({ at: new Date(teraz.getTime() - min(5)), sentAt: new Date() }),
        teraz,
      ),
    ).toBe(false);
  });

  it("príliš stará sa zahodí", () => {
    const tesnePod = new Date(teraz.getTime() - min(MAX_MESKANIE_MIN) + 1000);
    const tesneNad = new Date(teraz.getTime() - min(MAX_MESKANIE_MIN) - 1000);
    expect(jeNaOdoslanie(pripomienka({ at: tesnePod }), teraz)).toBe(true);
    expect(jeNaOdoslanie(pripomienka({ at: tesneNad }), teraz)).toBe(false);
  });

  it("hranica meškania sa dá zmeniť", () => {
    const pred30 = new Date(teraz.getTime() - min(30));
    expect(jeNaOdoslanie(pripomienka({ at: pred30 }), teraz, 60)).toBe(true);
    expect(jeNaOdoslanie(pripomienka({ at: pred30 }), teraz, 10)).toBe(false);
  });

  it("neplatný dátum sa nepošle", () => {
    expect(jeNaOdoslanie(pripomienka({ at: new Date(Number.NaN) }), teraz)).toBe(false);
    expect(jeNaOdoslanie(pripomienka({ at: new Date(teraz) }), new Date(Number.NaN))).toBe(false);
  });
});

describe("naOdoslanie", () => {
  const teraz = new Date("2026-08-22T10:00:00.000Z");
  const pred = (m: number): Date => new Date(teraz.getTime() - min(m));

  it("vyberie len tie, ktoré majú ísť", () => {
    const out = naOdoslanie(
      [
        pripomienka({ id: "dozreta", at: pred(5) }),
        pripomienka({ id: "buduca", at: new Date(teraz.getTime() + min(5)) }),
        pripomienka({ id: "odoslana", at: pred(5), sentAt: new Date() }),
        pripomienka({ id: "stara", at: pred(MAX_MESKANIE_MIN + 10) }),
      ],
      teraz,
    );
    expect(out.map((p) => p.id)).toEqual(["dozreta"]);
  });

  it("od najstaršej — pri strope idú tie, čo čakajú najdlhšie", () => {
    const out = naOdoslanie(
      [
        pripomienka({ id: "b", at: pred(5) }),
        pripomienka({ id: "a", at: pred(30) }),
        pripomienka({ id: "c", at: pred(1) }),
      ],
      teraz,
    );
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("pri rovnakom čase rozhoduje id, takže dva behy dajú to isté", () => {
    const vstup = [
      pripomienka({ id: "z", at: pred(5) }),
      pripomienka({ id: "a", at: pred(5) }),
      pripomienka({ id: "m", at: pred(5) }),
    ];
    expect(naOdoslanie(vstup, teraz).map((p) => p.id)).toEqual(["a", "m", "z"]);
    expect(naOdoslanie([...vstup].reverse(), teraz).map((p) => p.id)).toEqual(["a", "m", "z"]);
  });

  it("strop platí", () => {
    const vela = Array.from({ length: 80 }, (_, i) =>
      pripomienka({ id: `p${String(i).padStart(3, "0")}`, at: pred(i + 1) }),
    );
    expect(naOdoslanie(vela, teraz).length).toBe(50);
    expect(naOdoslanie(vela, teraz, { limit: 3 }).length).toBe(3);
    expect(naOdoslanie(vela, teraz, { limit: 0 })).toEqual([]);
  });

  it("prázdny vstup dá prázdny výstup", () => {
    expect(naOdoslanie([], teraz)).toEqual([]);
  });

  it("vstup sa nemení", () => {
    const vstup = [pripomienka({ id: "b", at: pred(1) }), pripomienka({ id: "a", at: pred(9) })];
    const kopia = vstup.map((p) => p.id);
    naOdoslanie(vstup, teraz);
    expect(vstup.map((p) => p.id)).toEqual(kopia);
  });
});

describe("jePremeskana", () => {
  const teraz = new Date("2026-08-22T10:00:00.000Z");

  it("stará a neodoslaná je premeškaná — plánovač ju má odpísať", () => {
    expect(
      jePremeskana(pripomienka({ at: new Date(teraz.getTime() - min(MAX_MESKANIE_MIN + 1)) }), teraz),
    ).toBe(true);
  });

  it("čerstvá premeškaná nie je", () => {
    expect(jePremeskana(pripomienka({ at: new Date(teraz.getTime() - min(5)) }), teraz)).toBe(false);
  });

  it("budúca premeškaná nie je", () => {
    expect(jePremeskana(pripomienka({ at: new Date(teraz.getTime() + min(60)) }), teraz)).toBe(false);
  });

  it("odoslaná už premeškaná byť nemôže", () => {
    expect(
      jePremeskana(
        pripomienka({ at: new Date(teraz.getTime() - min(999)), sentAt: new Date() }),
        teraz,
      ),
    ).toBe(false);
  });

  /* Tieto dve sa nesmú prekrývať — inak by riadok buď odišiel dvakrát,
     alebo by v tabuľke ležal navždy. */
  it("naOdoslanie a jePremeskana sa navzájom vylučujú a spolu pokryjú všetko dozreté", () => {
    for (const m of [0, 1, 15, 60, MAX_MESKANIE_MIN - 1, MAX_MESKANIE_MIN, MAX_MESKANIE_MIN + 1]) {
      const p = pripomienka({ at: new Date(teraz.getTime() - min(m)) });
      const posle = jeNaOdoslanie(p, teraz);
      const zahodi = jePremeskana(p, teraz);
      expect(posle && zahodi).toBe(false);
      expect(posle || zahodi).toBe(true);
    }
  });
});

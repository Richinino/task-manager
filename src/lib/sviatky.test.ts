import { describe, expect, it } from "vitest";

import { slovenskeSviatky, sviatkySkolskehoRoka } from "./sviatky";

function najdi(rok: number, nazov: string): string | undefined {
  return slovenskeSviatky(rok).find((s) => s.nazov === nazov)?.date;
}

describe("slovenskeSviatky", () => {
  /*
    Presne tie dva dni, na ktorých sa ukázalo, že odber z EduPage sviatky
    nevynecháva: 15. 9. aj 17. 11. 2026 mali vo feede plných osem hodín.
  */
  it("pozná dni, na ktorých feed klame", () => {
    expect(najdi(2026, "Sedembolestná Panna Mária")).toBe("2026-09-15");
    expect(najdi(2026, "Deň boja za slobodu a demokraciu")).toBe("2026-11-17");
  });

  it("má všetky pevné sviatky plus dva veľkonočné", () => {
    expect(slovenskeSviatky(2026)).toHaveLength(15);
  });

  /*
    Veľká noc je jediný pohyblivý sviatok a počíta sa z cirkevného pravidla.
    Overené na rokoch, ktoré sa dajú skontrolovať v kalendári — vrátane 2038,
    kde Veľká noc padne až na 25. apríla, čo je jej najneskorší možný termín.
  */
  it("počíta Veľkú noc správne", () => {
    expect(najdi(2026, "Veľkonočný pondelok")).toBe("2026-04-06");
    expect(najdi(2027, "Veľkonočný pondelok")).toBe("2027-03-29");
    expect(najdi(2024, "Veľkonočný pondelok")).toBe("2024-04-01");
    expect(najdi(2038, "Veľkonočný pondelok")).toBe("2038-04-26");
  });

  it("Veľký piatok je dva dni pred pondelkom", () => {
    expect(najdi(2026, "Veľký piatok")).toBe("2026-04-03");
    expect(najdi(2027, "Veľký piatok")).toBe("2027-03-26");
  });

  it("vracia ich zoradené", () => {
    const datumy = slovenskeSviatky(2026).map((s) => s.date);
    expect(datumy).toEqual([...datumy].sort());
  });

  /*
    Veľká noc vie preskočiť z marca do apríla; keby sa mesiac počítal zle,
    prejavilo by sa to práve tu.
  */
  it("znesie prechod marec–apríl", () => {
    expect(najdi(2025, "Veľkonočný pondelok")).toBe("2025-04-21");
    expect(najdi(2008, "Veľkonočný pondelok")).toBe("2008-03-24");
  });
});

describe("sviatkySkolskehoRoka", () => {
  /*
    Školský rok sedí na dvoch kalendárnych. „Sviatky roka 2026" by vynechali
    všetko od januára — vrátane Veľkej noci, čo je najdlhšie voľno v druhom
    polroku.
  */
  it("siaha od septembra do augusta", () => {
    const rok = sviatkySkolskehoRoka(2026);
    const datumy = rok.map((s) => s.date);

    expect(datumy).toContain("2026-09-15");
    expect(datumy).toContain("2026-12-24");
    expect(datumy).toContain("2027-03-29");
    expect(datumy).toContain("2027-05-01");
  });

  it("nezahrnie september nasledujúceho roka", () => {
    const datumy = sviatkySkolskehoRoka(2026).map((s) => s.date);
    expect(datumy).not.toContain("2027-09-15");
    expect(datumy).not.toContain("2026-05-01");
  });

  it("je zoradený", () => {
    const datumy = sviatkySkolskehoRoka(2026).map((s) => s.date);
    expect(datumy).toEqual([...datumy].sort());
  });
});

import { describe, expect, it } from "vitest";

import {
  shortDuration,
  summarizeAreas,
  type AreaSummaryInput,
} from "@/lib/area-summary";

/** Úloha v oblasti — testy prepisujú len to, čo skúmajú. */
function task(
  areaName: string | null,
  estimateMin: number | null = null,
): AreaSummaryInput {
  return {
    area: areaName === null ? null : { id: areaName, name: areaName, color: "indigo" },
    estimateMin,
  };
}

describe("summarizeAreas", () => {
  it("zoskupí úlohy podľa oblasti a spočíta minúty", () => {
    const { areas } = summarizeAreas([
      task("Práca", 30),
      task("Práca", 15),
      task("Zdravie", 5),
    ]);
    expect(areas.map((a) => [a.name, a.count, a.minutes])).toEqual([
      ["Práca", 2, 45],
      ["Zdravie", 1, 5],
    ]);
  });

  /*
    Toto je celé rozhodnutie tejto funkcie: otázka znie „kam mi tečie deň",
    a na tú odpovedá čas, nie počet položiek.
  */
  it("radí podľa MINÚT, nie podľa počtu", () => {
    const { areas } = summarizeAreas([
      task("Drobnosti", 5),
      task("Drobnosti", 5),
      task("Drobnosti", 5),
      task("Hlboká práca", 120),
    ]);
    expect(areas[0]?.name).toBe("Hlboká práca");
  });

  it("pri rovnakom čase rozhoduje počet", () => {
    const { areas } = summarizeAreas([
      task("Jedna", 60),
      task("Dve", 30),
      task("Dve", 30),
    ]);
    expect(areas[0]?.name).toBe("Dve");
  });

  it("pri rovnakom čase aj počte rozhoduje meno — poradie sa nesmie hýbať", () => {
    const prve = summarizeAreas([task("Zdravie", 10), task("Domov", 10)]);
    const druhe = summarizeAreas([task("Domov", 10), task("Zdravie", 10)]);
    expect(prve.areas.map((a) => a.name)).toEqual(["Domov", "Zdravie"]);
    expect(druhe.areas.map((a) => a.name)).toEqual(prve.areas.map((a) => a.name));
  });

  it("úlohy bez odhadu sa počítajú, ale minúty nedvíhajú", () => {
    const { areas } = summarizeAreas([task("Práca", 30), task("Práca", null)]);
    expect(areas[0]).toMatchObject({ count: 2, minutes: 30, withoutEstimate: 1 });
  });

  /*
    Bez tohto by súčet oblastí nesedel s dĺžkou zoznamu a človek by hľadal,
    kde sa mu úlohy stratili.
  */
  it("úlohy bez oblasti sa rátajú zvlášť, nie medzi oblasti", () => {
    const { areas, unassigned } = summarizeAreas([
      task("Práca", 30),
      task(null, 15),
      task(null, null),
    ]);
    expect(areas).toHaveLength(1);
    expect(unassigned).toBe(2);
  });

  it("prázdny vstup dá prázdny rozpad", () => {
    expect(summarizeAreas([])).toEqual({ areas: [], unassigned: 0 });
  });

  it("vstupné pole sa nemení", () => {
    const vstup = [task("Práca", 30), task("Zdravie", 5)];
    const kopia = JSON.stringify(vstup);
    summarizeAreas(vstup);
    expect(JSON.stringify(vstup)).toBe(kopia);
  });
});

describe("shortDuration", () => {
  it("pod hodinu ukáže minúty", () => {
    expect(shortDuration(5)).toBe("5 m");
    expect(shortDuration(59)).toBe("59 m");
  });

  it("celé hodiny bez minút", () => {
    expect(shortDuration(60)).toBe("1 h");
    expect(shortDuration(120)).toBe("2 h");
  });

  it("hodiny so zvyškom", () => {
    expect(shortDuration(90)).toBe("1 h 30 m");
    expect(shortDuration(155)).toBe("2 h 35 m");
  });

  it("nula je nula minút, nie prázdno", () => {
    expect(shortDuration(0)).toBe("0 m");
  });
});

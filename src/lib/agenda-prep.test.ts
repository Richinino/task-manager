import { describe, expect, it } from "vitest";

import { planPrep, prepTitle, shiftPrepDate, type PrepDayInfo } from "./agenda-prep";

/* 28. 9. 2026 je pondelok, písomka v piatok 2. 10. → plán −4 (po), −2 (st), −1 (št). */
const DNES = "2026-09-26";
const PISOMKA = "2026-10-02";

const volny: PrepDayInfo = { lessons: 5, clash: null, blockedBy: null };

function den(overrides: Record<string, Partial<PrepDayInfo>> = {}) {
  return (iso: string): PrepDayInfo => ({ ...volny, ...overrides[iso] });
}

describe("planPrep", () => {
  it("písomka: dve učenia a zopakovanie deň pred", () => {
    const plan = planPrep({ type: "exam", date: PISOMKA, todayIso: DNES, day: den() });
    expect(plan.map((s) => [s.date, s.kind, s.estimateMin, s.why])).toEqual([
      ["2026-09-28", "study", 45, null],
      ["2026-09-30", "study", 45, null],
      ["2026-10-01", "review", 20, null],
    ]);
  });

  it("skúšanie: jedno učenie a zopakovanie, kratšie", () => {
    const plan = planPrep({ type: "oral", date: PISOMKA, todayIso: DNES, day: den() });
    expect(plan.map((s) => [s.date, s.kind, s.estimateMin])).toEqual([
      ["2026-09-30", "study", 30],
      ["2026-10-01", "review", 20],
    ]);
  });

  it("deň s inou písomkou preskočí a povie prečo", () => {
    const plan = planPrep({
      type: "exam",
      date: PISOMKA,
      todayIso: DNES,
      day: den({ "2026-09-30": { clash: "písomka FYZ" } }),
    });
    const druhe = plan[1]!;
    expect(druhe.date).toBe("2026-09-29");
    expect(druhe.why).toBe("v st 30. 9. je písomka FYZ");
  });

  it("vyhne sa dňu so siedmimi hodinami aj dňu, ktorý zaberá výlet", () => {
    const plan = planPrep({
      type: "exam",
      date: PISOMKA,
      todayIso: DNES,
      day: den({ "2026-09-28": { lessons: 7 }, "2026-09-27": { blockedBy: "Výlet" } }),
    });
    expect(plan[0]!.date).toBe("2026-09-29");
    expect(plan[0]!.why).toBe("po 28. 9. má 7 hodín");
    // Utorok zabral prvý krok, druhý ostane v stredu.
    expect(plan.map((s) => s.date)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  it("nikdy do minulosti, nikdy v deň písomky, nikdy dva kroky na jeden deň", () => {
    const zajtra = planPrep({ type: "exam", date: "2026-09-27", todayIso: DNES, day: den() });
    expect(zajtra.map((s) => [s.date, s.kind])).toEqual([["2026-09-26", "review"]]);
    expect(planPrep({ type: "exam", date: DNES, todayIso: DNES, day: den() })).toEqual([]);
  });

  it("zopakovanie deň pred ostane, aj keď učeniu treba hľadať iný deň", () => {
    // Pondelok aj utorok majú inú písomku — druhé učenie ide na nedeľu, prvé na sobotu.
    const plan = planPrep({
      type: "exam",
      date: "2026-10-01",
      todayIso: DNES,
      day: den({ "2026-09-28": { clash: "písomka MAT" }, "2026-09-29": { clash: "skúšanie FYZ" } }),
    });
    expect(plan.map((s) => [s.date, s.kind])).toEqual([
      ["2026-09-26", "study"],
      ["2026-09-27", "study"],
      ["2026-09-30", "review"],
    ]);
    expect(plan[1]!.why).toBe("v ut 29. 9. je skúšanie FYZ");
  });

  it("keď sa nehodí nič, ostane pôvodný deň bez vysvetlenia", () => {
    const plny = { lessons: 8 };
    const vsetko = Object.fromEntries(
      ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].map((d) => [d, plny]),
    );
    const plan = planPrep({ type: "oral", date: PISOMKA, todayIso: DNES, day: den(vsetko) });
    expect(plan.map((s) => [s.date, s.why])).toEqual([
      ["2026-09-30", null],
      ["2026-10-01", null],
    ]);
  });
});

describe("prepTitle", () => {
  it("druh a téma písomky", () => {
    expect(prepTitle("study", "exam", "Písomka")).toBe("Učiť sa na písomku");
    expect(prepTitle("review", "exam", "Písomka — funkcie")).toBe("Zopakovať pred písomkou — funkcie");
    expect(prepTitle("review", "oral", "Ústne skúšanie")).toBe("Zopakovať pred skúšaním");
  });
});

describe("shiftPrepDate", () => {
  it("posunie o rovnaký počet dní, nie do minulosti ani za hranicu", () => {
    // Hranica pri písomke = deň pred ňou.
    expect(shiftPrepDate("2026-09-30", 7, DNES, "2026-10-08")).toBe("2026-10-07");
    expect(shiftPrepDate("2026-09-28", -3, DNES, "2026-09-28")).toBe("2026-09-26");
    expect(shiftPrepDate("2026-10-01", 1, DNES, "2026-10-01")).toBe("2026-10-01");
    expect(shiftPrepDate("2026-09-28", -5, DNES, "2026-09-25")).toBe(DNES);
  });
});

import { describe, expect, it } from "vitest";

import { capitalizeSk, overdueLabel, relativeDayLabel } from "./day-label";

describe("relativeDayLabel", () => {
  it("pomenuje blízke dni", () => {
    expect(relativeDayLabel("2026-11-22", "2026-11-22")).toBe("Dnes");
    expect(relativeDayLabel("2026-11-23", "2026-11-22")).toBe("Zajtra");
    expect(relativeDayLabel("2026-11-21", "2026-11-22")).toBe("Včera");
  });
  it("vzdialený deň nepomenuje", () => {
    expect(relativeDayLabel("2026-12-22", "2026-11-22")).toBeNull();
  });
});

describe("overdueLabel", () => {
  it("skloňuje dni", () => {
    expect(overdueLabel(1)).toBe("Po termíne, od včera");
    expect(overdueLabel(3)).toBe("Po termíne, pred 3 dňami");
    expect(overdueLabel(0)).toBe("Po termíne");
  });
});

describe("capitalizeSk", () => {
  it("zväčší prvé písmeno", () => {
    expect(capitalizeSk("štvrtok")).toBe("Štvrtok");
  });
});

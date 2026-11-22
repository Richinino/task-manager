import { describe, expect, it } from "vitest";

import { addedLabel, swipeTarget } from "./inbox-card";

describe("swipeTarget", () => {
  it("rozhoduje až od prahu", () => {
    expect(swipeTarget(89)).toBeNull();
    expect(swipeTarget(-89)).toBeNull();
    expect(swipeTarget(90)).toBe("today");
    expect(swipeTarget(-120)).toBe("someday");
  });
});

describe("addedLabel", () => {
  it("píše dnes s časom v pásme používateľa", () => {
    const at = new Date("2026-11-22T07:47:00Z");
    expect(addedLabel(at, "2026-11-22", "Europe/Bratislava")).toBe("pridané dnes 8:47");
  });
  it("píše včera", () => {
    const at = new Date("2026-11-21T20:03:00Z");
    expect(addedLabel(at, "2026-11-22", "Europe/Bratislava")).toBe("pridané včera 21:03");
  });
});

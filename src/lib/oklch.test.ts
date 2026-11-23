import { describe, expect, it } from "vitest";

import { cssColorToHex, oklchToHex } from "@/lib/oklch";

describe("oklchToHex", () => {
  it("biela a čierna", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
  });

  it("známe farby (červená, zelená, modrá z oklch)", () => {
    expect(oklchToHex(0.62796, 0.25768, 29.23)).toBe("#ff0000");
    expect(oklchToHex(0.86644, 0.29483, 142.5)).toBe("#00ff00");
    expect(oklchToHex(0.45201, 0.31321, 264.05)).toBe("#0000ff");
  });

  it("vždy platný hex aj mimo gamutu", () => {
    expect(oklchToHex(0.66, 0.22, 325)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("cssColorToHex", () => {
  it("prevedie oklch reťazec z palety", () => {
    expect(cssColorToHex("oklch(0.60 0.20 295)")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("neznámy tvar vráti null", () => {
    expect(cssColorToHex("var(--fg-subtle)")).toBeNull();
    expect(cssColorToHex("#fff")).toBeNull();
  });
});

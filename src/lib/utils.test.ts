import { describe, expect, it } from "vitest";

import { cn } from "./utils";

/**
 * Testy pre `cn` existujú kvôli jednej konkrétnej pasci, ktorá už raz
 * v tomto projekte zabrala.
 *
 * `tailwind-merge` si vlastné mená veľkostí (`text-body`, `text-mini`)
 * vykladá ako FARBU textu — sú to pre neho neznáme slová, presne ako
 * `text-danger`. Keď sú v tom istom volaní obe, jednu zahodí ako konflikt
 * a v praxi vypadne veľkosť. Odznak potom má 16 px namiesto 10 a nikde nie
 * je chyba: preklad o triedach nevie a v prehliadači to okom prehliadneš.
 *
 * Preto sa tu netestuje `cn` ako funkcia, ale to, že škála z `globals.css`
 * je dopísaná v `extendTailwindMerge`. Kto pridá novú veľkosť a zabudne na
 * to, sa dozvie tu — nie o týždeň na obrazovke.
 */
describe("cn — veľkosť písma vedľa farby", () => {
  const VELKOSTI = [
    "text-micro",
    "text-mini",
    "text-meta",
    "text-body",
    "text-row",
    "text-hero",
  ] as const;

  it.each(VELKOSTI)("%s prežije vedľa text-danger", (velkost) => {
    const out = cn(velkost, "text-danger");
    expect(out).toContain(velkost);
    expect(out).toContain("text-danger");
  });

  it.each(VELKOSTI)("%s prežije aj keď farba ide prvá", (velkost) => {
    const out = cn("text-fg-muted", velkost);
    expect(out).toContain(velkost);
    expect(out).toContain("text-fg-muted");
  });

  it("dve veľkosti sú naopak konflikt — vyhráva posledná", () => {
    expect(cn("text-mini", "text-body")).toBe("text-body");
    expect(cn("text-body", "text-micro")).toBe("text-micro");
  });

  it("vlastná veľkosť prebije vstavanú a naopak", () => {
    expect(cn("text-xs", "text-body")).toBe("text-body");
    expect(cn("text-body", "text-xs")).toBe("text-xs");
  });

  it("dve farby ostávajú konfliktom, ktorý rieši poradie", () => {
    expect(cn("text-fg-muted", "text-danger")).toBe("text-danger");
  });
});

describe("cn — bežné správanie", () => {
  it("spája a odstraňuje prázdne hodnoty", () => {
    expect(cn("a", null, undefined, false, "b")).toBe("a b");
  });

  it("podmienené triedy cez objekt aj pole", () => {
    expect(cn({ a: true, b: false }, ["c", { d: true }])).toBe("a c d");
  });

  it("rieši konflikt aj v odsadení a šírke", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("h-11", "md:h-9")).toBe("h-11 md:h-9");
  });

  it("bez vstupu vráti prázdny reťazec", () => {
    expect(cn()).toBe("");
  });
});

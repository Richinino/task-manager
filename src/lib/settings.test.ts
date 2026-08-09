import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  isValidTimeZone,
  parseSettings,
  settingsInputSchema,
} from "@/lib/settings";

/** Prvá hláška, ktorou vstupná schéma odmietla — alebo `null`, keď prešla. */
function refusal(patch: Record<string, unknown>): string | null {
  const result = settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, ...patch });
  return result.success ? null : (result.error.issues[0]?.message ?? "?");
}

describe("settingsInputSchema — krížové kontroly", () => {
  it("prah blokovania pod prahom upozornenia sa odmietne", () => {
    expect(refusal({ postponeWarnAt: 3, postponeBlockAt: 2 })).toBe(
      "Prah blokovania musí byť vyšší než prah upozornenia.",
    );
  });

  it("rovnaké prahy sa odmietnu — blok musí prísť až po upozornení", () => {
    expect(refusal({ postponeWarnAt: 3, postponeBlockAt: 3 })).not.toBeNull();
  });

  it("koniec dňa pred jeho začiatkom sa odmietne", () => {
    expect(refusal({ dayStartHour: 18, dayEndHour: 8 })).toBe(
      "Koniec dňa musí byť neskôr než jeho začiatok.",
    );
  });

  it("rovnaký začiatok aj koniec sa odmietne — deň by nemal žiadny čas", () => {
    expect(refusal({ dayStartHour: 9, dayEndHour: 9 })).not.toBeNull();
  });

  it("vyblednutie skôr než inkubátor sa odmietne", () => {
    expect(refusal({ incubatorAfterDays: 200, fadeAfterDays: 180 })).not.toBeNull();
  });

  it("neexistujúce časové pásmo sa odmietne", () => {
    expect(refusal({ timezone: "Mars/Olympus" })).toBe("Také časové pásmo neexistuje.");
  });

  it("platná kombinácia prejde", () => {
    expect(
      refusal({
        postponeWarnAt: 2,
        postponeBlockAt: 4,
        dayStartHour: 6,
        dayEndHour: 22,
        timezone: "Asia/Tokyo",
      }),
    ).toBeNull();
  });
});

describe("parseSettings — čítanie ostáva zhovievavé", () => {
  /*
    Toto je dôvod, prečo krížové kontroly NIE SÚ v `settingsSchema`. Keby tam
    boli, jedna porušená dvojica by zhodila celý objekt na `DEFAULT_SETTINGS`
    a človek by prišiel aj o časové pásmo, ktoré s ňou nemá nič spoločné.
  */
  it("uložená porušená dvojica nezhodí ostatné nastavenia", () => {
    const stored = {
      ...DEFAULT_SETTINGS,
      postponeWarnAt: 9,
      postponeBlockAt: 2,
      timezone: "Asia/Tokyo",
      wipLimit: 11,
    };
    const parsed = parseSettings(stored);
    expect(parsed.timezone).toBe("Asia/Tokyo");
    expect(parsed.wipLimit).toBe(11);
  });

  it("chýbajúce polia padnú na default", () => {
    expect(parseSettings({ wipLimit: 9 })).toMatchObject({
      wipLimit: 9,
      timezone: DEFAULT_SETTINGS.timezone,
    });
  });

  it("úplne pokazený vstup padne na defaulty a nespadne", () => {
    expect(parseSettings("nezmysel")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("isValidTimeZone", () => {
  it("rozozná platné pásmo", () => {
    expect(isValidTimeZone("Europe/Bratislava")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rozozná neplatné pásmo namiesto pádu", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

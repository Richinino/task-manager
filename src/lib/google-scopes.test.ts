import { describe, expect, it } from "vitest";

import {
  CALENDAR_SCOPE,
  CALENDAR_SCOPE_REQUEST,
  grantsCalendar,
  LOGIN_SCOPE,
} from "@/lib/google-scopes";

describe("rozdelenie oprávnení", () => {
  it("prihlásenie nepýta kalendár — to je celý zmysel rozdelenia", () => {
    expect(LOGIN_SCOPE).not.toContain("calendar");
  });

  it("žiadosť o kalendár si drží aj identitu", () => {
    // Bez `openid email profile` by sa človek po súhlase s kalendárom
    // z appky odhlásil — Google by vrátil token bez identity.
    expect(CALENDAR_SCOPE_REQUEST).toContain(LOGIN_SCOPE);
    expect(CALENDAR_SCOPE_REQUEST).toContain(CALENDAR_SCOPE);
  });
});

describe("grantsCalendar", () => {
  it("súhlas s kalendárom rozpozná", () => {
    expect(grantsCalendar(CALENDAR_SCOPE_REQUEST)).toBe(true);
  });

  it("bežné prihlásenie kalendár nenesie", () => {
    expect(grantsCalendar(LOGIN_SCOPE)).toBe(false);
  });

  it("na poradí oprávnení nezáleží", () => {
    expect(grantsCalendar(`${CALENDAR_SCOPE} openid email`)).toBe(true);
  });

  it("nič a prázdno je nie", () => {
    expect(grantsCalendar(null)).toBe(false);
    expect(grantsCalendar(undefined)).toBe(false);
    expect(grantsCalendar("")).toBe(false);
  });

  /*
    Porovnáva sa celé oprávnenie, nie podreťazec. `includes()` nad celým
    reťazcom by prijal aj `…/calendar.readonly.nieco`, teda niečo úplne iné,
    čo sa len tak začína — a na základe toho by sa uložili tokeny.
  */
  it("podobné oprávnenie sa za kalendár nevydáva", () => {
    expect(grantsCalendar(`${CALENDAR_SCOPE}.extra`)).toBe(false);
    expect(grantsCalendar("https://www.googleapis.com/auth/calendar")).toBe(false);
  });

  it("viac medzier medzi oprávneniami nevadí", () => {
    expect(grantsCalendar(`openid   ${CALENDAR_SCOPE}`)).toBe(true);
  });
});

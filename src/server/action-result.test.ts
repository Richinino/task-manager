import { describe, expect, it } from "vitest";

import { isPostponeBlocked } from "./action-result";

/**
 * Zúženie, ktoré rozhoduje o tom, či sa otvorí dialóg o zastavenom odklade.
 *
 * Testuje sa preto, že chyba v ňom je tichá v oboch smeroch: buď sa dialóg
 * neotvorí a odklad vyzerá ako obyčajná chyba, alebo sa otvorí s prázdnym
 * počítadlom. Ani jedno nezhodí preklad.
 */
describe("isPostponeBlocked", () => {
  const detail = { postponeCount: 4, postponeBlockAt: 5 };

  it("spozná zastavený odklad aj s údajmi", () => {
    expect(
      isPostponeBlocked({ ok: false, error: "…", code: "postpone_blocked", detail }),
    ).toBe(true);
  });

  it("úspech nikdy nie je zastavený odklad", () => {
    expect(isPostponeBlocked({ ok: true })).toBe(false);
    expect(isPostponeBlocked({ ok: true, code: "postpone_blocked", detail })).toBe(false);
  });

  it("iné zlyhanie neprejde", () => {
    expect(isPostponeBlocked({ ok: false, error: "Niečo iné" })).toBe(false);
    expect(isPostponeBlocked({ ok: false, error: "…", code: "ine" })).toBe(false);
  });

  it("bez použiteľného `detail` neprejde", () => {
    const bez = { ok: false, error: "…", code: "postpone_blocked" };
    expect(isPostponeBlocked(bez)).toBe(false);
    expect(isPostponeBlocked({ ...bez, detail: null })).toBe(false);
    expect(isPostponeBlocked({ ...bez, detail: {} })).toBe(false);
    expect(isPostponeBlocked({ ...bez, detail: { postponeCount: 4 } })).toBe(false);
    expect(isPostponeBlocked({ ...bez, detail: { postponeBlockAt: 5 } })).toBe(false);
  });

  it("čísla ako reťazce neprejdú — do vety by sa dostal cudzí tvar", () => {
    expect(
      isPostponeBlocked({
        ok: false,
        error: "…",
        code: "postpone_blocked",
        detail: { postponeCount: "4", postponeBlockAt: "5" },
      }),
    ).toBe(false);
  });

  it("nula je platný počet odkladov", () => {
    expect(
      isPostponeBlocked({
        ok: false,
        error: "…",
        code: "postpone_blocked",
        detail: { postponeCount: 0, postponeBlockAt: 2 },
      }),
    ).toBe(true);
  });
});

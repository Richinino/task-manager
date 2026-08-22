import { describe, expect, it, vi } from "vitest";

import {
  comboHasModifier,
  expandCombo,
  normalizeKey,
  normalizeKeyEvent,
  registerShortcuts,
} from "./keyboard";

/**
 * Testy pre klávesové skratky.
 *
 * Modul dlho žiadne nemal, hoci naň visí celé ovládanie appky bez myši —
 * a odkedy naň prešiel aj inbox, jedna chyba tu pokazí dve miesta naraz.
 *
 * Testuje sa čistá polovica: normalizácia, rozvinutie zápisu a register.
 * Druhá polovica (`isTextInputElement`, `isInsideOverlay`, `ownsTypedKeys`)
 * potrebuje skutočný DOM, ktorý tu nie je — tá sa overuje v prehliadači.
 */

/** Udalosť klávesnice bez DOM — čítajú sa z nej len tieto vlastnosti. */
function klaves(
  key: string,
  modifikatory: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifikatory,
  } as KeyboardEvent;
}

describe("normalizeKey", () => {
  it("zjednotí veľkosť písmen", () => {
    expect(normalizeKey("K")).toBe("k");
    expect(normalizeKey("Escape")).toBe("escape");
  });

  it("pozná skrátené názvy", () => {
    expect(normalizeKey("Esc")).toBe("escape");
    expect(normalizeKey("Del")).toBe("delete");
    expect(normalizeKey("Return")).toBe("enter");
    expect(normalizeKey("PgDn")).toBe("pagedown");
  });

  it("medzera má meno, nie znak", () => {
    expect(normalizeKey(" ")).toBe("space");
    expect(normalizeKey("Spacebar")).toBe("space");
  });

  it("šípky idú na malé písmená — na tomto stálo triedenie inboxu", () => {
    expect(normalizeKey("ArrowDown")).toBe("arrowdown");
    expect(normalizeKey("ArrowUp")).toBe("arrowup");
  });

  it("Backspace tiež — popisok skratky sa musí trafiť s udalosťou", () => {
    expect(normalizeKey("Backspace")).toBe("backspace");
  });
});

describe("normalizeKeyEvent", () => {
  it("holá klávesa je len ona sama", () => {
    expect(normalizeKeyEvent(klaves("k"))).toBe("k");
  });

  it("modifikátory majú pevné poradie ctrl, alt, shift, meta", () => {
    expect(
      normalizeKeyEvent(klaves("k", { shiftKey: true, ctrlKey: true, metaKey: true })),
    ).toBe("ctrl+shift+meta+k");
  });

  it("stlačenie samotného modifikátora nie je skratka", () => {
    for (const m of ["Control", "Alt", "Shift", "Meta"]) {
      expect(normalizeKeyEvent(klaves(m))).toBe("");
    }
  });

  it("prázdna klávesa nie je skratka", () => {
    expect(normalizeKeyEvent(klaves(""))).toBe("");
  });
});

describe("expandCombo", () => {
  it("„mod“ znamená Ctrl aj Cmd, aby zápis platil na Windowse aj na Macu", () => {
    expect(expandCombo("mod+k")).toEqual(["ctrl+k", "meta+k"]);
  });

  it("poradie zápisu nerozhoduje", () => {
    expect(expandCombo("shift+ctrl+k")).toEqual(expandCombo("ctrl+shift+k"));
  });

  it("aliasy modifikátorov sedia", () => {
    expect(expandCombo("cmd+k")).toEqual(["meta+k"]);
    expect(expandCombo("option+k")).toEqual(["alt+k"]);
  });

  it("zápis bez klávesy vráti prázdne pole, nie výnimku", () => {
    expect(expandCombo("ctrl+")).toEqual([]);
    expect(expandCombo("")).toEqual([]);
    expect(expandCombo("+++")).toEqual([]);
  });
});

describe("comboHasModifier", () => {
  it("holá klávesa modifikátor nemá", () => {
    expect(comboHasModifier("n")).toBe(false);
  });

  it("mod aj konkrétny modifikátor sa počítajú", () => {
    expect(comboHasModifier("mod+k")).toBe(true);
    expect(comboHasModifier("shift+n")).toBe(true);
  });
});

describe("registerShortcuts", () => {
  /** `EventTarget` z Node stačí — modul si od cieľa berie len poslucháča. */
  function ciel() {
    const target = new EventTarget();
    const stlac = (
      key: string,
      extra: Record<string, unknown> = {},
    ): Event & { defaultPrevented: boolean } => {
      const event = new Event("keydown", { cancelable: true });
      Object.assign(event, {
        key,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        ...extra,
      });
      target.dispatchEvent(event);
      return event as Event & { defaultPrevented: boolean };
    };
    return { target, stlac };
  }

  it("zavolá akciu a zhltne predvolené správanie", () => {
    const { target, stlac } = ciel();
    const run = vi.fn();
    registerShortcuts([{ keys: "n", run }], { target });

    const event = stlac("n");
    expect(run).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("preventDefault sa dá vypnúť", () => {
    const { target, stlac } = ciel();
    registerShortcuts([{ keys: "n", run: () => {}, preventDefault: false }], { target });
    expect(stlac("n").defaultPrevented).toBe(false);
  });

  it("odhlásenie naozaj odoberie poslucháča", () => {
    const { target, stlac } = ciel();
    const run = vi.fn();
    const odhlas = registerShortcuts([{ keys: "n", run }], { target });

    stlac("n");
    odhlas();
    stlac("n");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("jedna akcia môže mať viac zápisov", () => {
    const { target, stlac } = ciel();
    const run = vi.fn();
    registerShortcuts([{ keys: ["j", "ArrowDown"], run }], { target });

    stlac("j");
    stlac("ArrowDown");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("mod+k zaberie na Ctrl aj na Cmd", () => {
    const { target, stlac } = ciel();
    const run = vi.fn();
    registerShortcuts([{ keys: "mod+k", run }], { target });

    stlac("k", { ctrlKey: true });
    stlac("k", { metaKey: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("modifikátor navyše skratku NEspustí", () => {
    const { target, stlac } = ciel();
    const run = vi.fn();
    registerShortcuts([{ keys: "n", run }], { target });

    stlac("n", { ctrlKey: true });
    stlac("n", { altKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("už zhltnutá udalosť sa neberie druhýkrát", () => {
    const { target, stlac } = ciel();
    const run = vi.fn();
    registerShortcuts([{ keys: "n", run }], { target });

    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key: "n" });
    event.preventDefault();
    target.dispatchEvent(event);

    expect(run).not.toHaveBeenCalled();
    // …a bežná udalosť ďalej funguje, takže to nie je odhlásený poslucháč.
    stlac("n");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rozpísané IME sa ignoruje — inak by čínština spúšťala skratky", () => {
    const { target, stlac } = ciel();
    const run = vi.fn();
    registerShortcuts([{ keys: "n", run }], { target });

    stlac("n", { isComposing: true });
    stlac("n", { keyCode: 229 });
    expect(run).not.toHaveBeenCalled();
  });

  it("zaberie len prvá zhoda, nie všetky", () => {
    const { target, stlac } = ciel();
    const prva = vi.fn();
    const druha = vi.fn();
    registerShortcuts([{ keys: "n", run: prva }, { keys: "n", run: druha }], { target });

    stlac("n");
    expect(prva).toHaveBeenCalledTimes(1);
    expect(druha).not.toHaveBeenCalled();
  });

  it("prázdny zoznam vráti funkciu, ktorá nič nerobí", () => {
    const { target } = ciel();
    expect(() => registerShortcuts([], { target })()).not.toThrow();
  });

  it("nezmyselný zápis nezhodí register ani ostatné skratky", () => {
    const { target, stlac } = ciel();
    const run = vi.fn();
    registerShortcuts([{ keys: "ctrl+", run: () => {} }, { keys: "n", run }], { target });

    stlac("n");
    expect(run).toHaveBeenCalledTimes(1);
  });
});

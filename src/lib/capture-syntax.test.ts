import { describe, expect, it } from "vitest";

import {
  activeTokens,
  applyToken,
  removeToken,
  type SyntaxEdit,
  type SyntaxKind,
} from "@/lib/capture-syntax";
import { parseCapture } from "@/lib/parse";

/** Streda 5. augusta 2026 — rovnaký „dnešok" ako v testoch parsera. */
const NOW = new Date(2026, 7, 5, 13, 45, 0);
const OPTS = { now: NOW } as const;

/** Text s tokenom každého druhu — na overenie, že úprava nič iné nepokazí. */
const RICH = "kúpiť mlieko !1 !!vysoka 30m @doma do 20.8.";

/** Text nesmie mať dvojité medzery, medzeru na konci ani medzeru pred čiarkou. */
function expectClean(text: string): void {
  expect(text).not.toMatch(/\s\s/u);
  expect(text).not.toMatch(/\s$/u);
  expect(text).not.toMatch(/\s[,.;:)\]]/u);
}

describe("vloženie do textu bez tokenu", () => {
  it("prázdny text dá len samotný token", () => {
    const r = applyToken("", "priority", 1, OPTS);
    expect(r.text).toBe("!1");
    expect(r.cursor).toBe(2);
    expect(parseCapture(r.text, OPTS).priority).toBe(1);
  });

  it("text zo samých medzier nenechá odsadenie", () => {
    expect(applyToken("   ", "energy", "low", OPTS).text).toBe("!!nizka");
  });

  it("token sa pripojí na koniec a titulok ostane", () => {
    const r = applyToken("kúpiť mlieko", "energy", "high", OPTS);
    expect(r.text).toBe("kúpiť mlieko !!vysoka");
    expect(r.cursor).toBe(r.text.length);

    const parsed = parseCapture(r.text, OPTS);
    expect(parsed.energy).toBe("high");
    expect(parsed.title).toBe("kúpiť mlieko");
  });

  it("medzera na konci textu sa nezdvojí", () => {
    expect(applyToken("kúpiť mlieko ", "priority", 3, OPTS).text).toBe(
      "kúpiť mlieko !3",
    );
  });

  it("kurzor ukazuje presne za vložený token", () => {
    const r = applyToken("kúpiť mlieko", "context", "doma", OPTS);
    expect(r.text.slice(r.cursor - 5, r.cursor)).toBe("@doma");
  });
});

describe("tvary jednotlivých tokenov", () => {
  it("priorita", () => {
    expect(applyToken("úloha", "priority", 2, OPTS).text).toBe("úloha !2");
  });

  it("energia bez diakritiky", () => {
    expect(applyToken("úloha", "energy", "low", OPTS).text).toBe("úloha !!nizka");
    expect(applyToken("úloha", "energy", "mid", OPTS).text).toBe("úloha !!stredna");
    expect(applyToken("úloha", "energy", "high", OPTS).text).toBe("úloha !!vysoka");
  });

  it("odhad v minútach a celých hodinách", () => {
    expect(applyToken("úloha", "estimate", 30, OPTS).text).toBe("úloha 30m");
    expect(applyToken("úloha", "estimate", 60, OPTS).text).toBe("úloha 1h");
    expect(applyToken("úloha", "estimate", 90, OPTS).text).toBe("úloha 90m");
    expect(applyToken("úloha", "estimate", 120, OPTS).text).toBe("úloha 2h");
  });

  it("termín má predložku, plán nie", () => {
    expect(applyToken("úloha", "due", "2026-08-20", OPTS).text).toBe("úloha do 20.8.");
    expect(applyToken("úloha", "planned", "2026-08-20", OPTS).text).toBe("úloha 20.8.");
  });

  it("kontext dostane zavináč a nezdvojí ho", () => {
    expect(applyToken("úloha", "context", "doma", OPTS).text).toBe("úloha @doma");
    expect(applyToken("úloha", "context", "@doma", OPTS).text).toBe("úloha @doma");
  });

  it("každý vložený token parser prečíta späť na tú istú hodnotu", () => {
    expect(parseCapture(applyToken("", "priority", 3, OPTS).text, OPTS).priority).toBe(3);
    expect(parseCapture(applyToken("", "energy", "mid", OPTS).text, OPTS).energy).toBe("mid");
    expect(parseCapture(applyToken("", "estimate", 45, OPTS).text, OPTS).estimateMin).toBe(45);
    expect(parseCapture(applyToken("", "estimate", 120, OPTS).text, OPTS).estimateMin).toBe(120);
    expect(parseCapture(applyToken("", "due", "2026-08-20", OPTS).text, OPTS).dueDate).toBe(
      "2026-08-20",
    );
    expect(
      parseCapture(applyToken("", "planned", "2026-08-20", OPTS).text, OPTS).plannedDate,
    ).toBe("2026-08-20");
    expect(parseCapture(applyToken("", "context", "praca", OPTS).text, OPTS).context).toBe(
      "@praca",
    );
  });
});

describe("dátumy a roky", () => {
  it("termín v inom roku si vypíše rok", () => {
    const r = applyToken("odovzdať priznanie", "due", "2027-03-31", OPTS);
    expect(r.text).toBe("odovzdať priznanie do 31.3.2027");
    expect(parseCapture(r.text, OPTS).dueDate).toBe("2027-03-31");
  });

  it("plán v inom roku si vypíše rok", () => {
    const r = applyToken("lyžovačka", "planned", "2027-01-15", OPTS);
    expect(r.text).toBe("lyžovačka 15.1.2027");
    expect(parseCapture(r.text, OPTS).plannedDate).toBe("2027-01-15");
  });

  it("dátum, ktorý tento rok už bol, sa nesmie posunúť do budúceho roku", () => {
    const r = applyToken("dorobiť", "due", "2026-03-31", OPTS);
    expect(r.text).toContain("2026");
    expect(parseCapture(r.text, OPTS).dueDate).toBe("2026-03-31");
  });

  it("dnešok sa píše krátko", () => {
    const r = applyToken("úloha", "planned", "2026-08-05", OPTS);
    expect(r.text).toBe("úloha 5.8.");
    expect(parseCapture(r.text, OPTS).plannedDate).toBe("2026-08-05");
  });

  it("neplatný dátum text nepokazí", () => {
    expect(applyToken("úloha", "due", "nezmysel", OPTS).text).toBe("úloha");
    expect(applyToken("úloha", "due", "2026-02-31", OPTS).text).toBe("úloha");
    expect(applyToken("úloha", "planned", "", OPTS).text).toBe("úloha");
  });
});

describe("nahradenie existujúceho tokenu", () => {
  it("priorita sa nahradí, nezdvojí", () => {
    const r = applyToken("úloha !1", "priority", 2, OPTS);
    expect(r.text).toBe("úloha !2");
    expect(r.text).not.toContain("!1");
    expect(parseCapture(r.text, OPTS).priority).toBe(2);
  });

  it("energia sa nahradí", () => {
    expect(applyToken("úloha !!nizka", "energy", "high", OPTS).text).toBe(
      "úloha !!vysoka",
    );
  });

  it("odhad sa nahradí aj s predložkou, ktorá k nemu patrí", () => {
    expect(applyToken("úloha 30m", "estimate", 120, OPTS).text).toBe("úloha 2h");
    expect(applyToken("porada za 2 hodiny", "estimate", 45, OPTS).text).toBe(
      "porada 45m",
    );
  });

  it("plán nahradí slovný tvar aj s predložkou", () => {
    const r = applyToken("porada zajtra", "planned", "2026-08-20", OPTS);
    expect(r.text).toBe("porada 20.8.");
    expect(r.text).not.toContain("zajtra");

    expect(applyToken("porada na zajtra", "planned", "2026-08-20", OPTS).text).toBe(
      "porada 20.8.",
    );
  });

  it("termín nahradí „do piatku“ celý, nenechá visieť predložku", () => {
    const r = applyToken("odovzdať do piatku", "due", "2026-08-20", OPTS);
    expect(r.text).toBe("odovzdať do 20.8.");
    expect(parseCapture(r.text, OPTS).dueDate).toBe("2026-08-20");
  });

  it("kontext sa nahradí", () => {
    expect(applyToken("úloha @praca", "context", "doma", OPTS).text).toBe("úloha @doma");
  });

  it("token uprostred textu nezlepí susedné slová", () => {
    const r = applyToken("kúpiť !1 mlieko", "priority", 3, OPTS);
    expect(r.text).toBe("kúpiť !3 mlieko");
    expect(r.cursor).toBe(8);
  });

  it("opakované vloženie tej istej hodnoty text nemení", () => {
    const once = applyToken("úloha", "priority", 1, OPTS).text;
    const twice = applyToken(once, "priority", 1, OPTS).text;
    expect(twice).toBe(once);
  });
});

describe("ostatné tokeny prežijú úpravu", () => {
  it("v texte so všetkými druhmi ostane po každej úprave zvyšok nedotknutý", () => {
    const before = parseCapture(RICH, OPTS);
    expect(before.priority).toBe(1);
    expect(before.energy).toBe("high");
    expect(before.estimateMin).toBe(30);
    expect(before.context).toBe("@doma");
    expect(before.dueDate).toBe("2026-08-20");
    expect(before.title).toBe("kúpiť mlieko");

    const after = applyToken(RICH, "planned", "2026-08-21", OPTS);
    const parsed = parseCapture(after.text, OPTS);
    expect(parsed.plannedDate).toBe("2026-08-21");
    expect(parsed.priority).toBe(1);
    expect(parsed.energy).toBe("high");
    expect(parsed.estimateMin).toBe(30);
    expect(parsed.context).toBe("@doma");
    expect(parsed.dueDate).toBe("2026-08-20");
    expect(parsed.title).toBe("kúpiť mlieko");
  });

  it("nahradenie ktoréhokoľvek druhu zachová všetky ostatné hodnoty", () => {
    const edits: Array<[SyntaxKind, SyntaxEdit]> = [
      ["priority", applyToken(RICH, "priority", 3, OPTS)],
      ["energy", applyToken(RICH, "energy", "low", OPTS)],
      ["estimate", applyToken(RICH, "estimate", 90, OPTS)],
      ["due", applyToken(RICH, "due", "2026-09-10", OPTS)],
      ["context", applyToken(RICH, "context", "praca", OPTS)],
    ];

    for (const [kind, edit] of edits) {
      expectClean(edit.text);
      const parsed = parseCapture(edit.text, OPTS);
      expect(parsed.title).toBe("kúpiť mlieko");
      expect(parsed.priority).toBe(kind === "priority" ? 3 : 1);
      expect(parsed.energy).toBe(kind === "energy" ? "low" : "high");
      expect(parsed.estimateMin).toBe(kind === "estimate" ? 90 : 30);
      expect(parsed.dueDate).toBe(kind === "due" ? "2026-09-10" : "2026-08-20");
      expect(parsed.context).toBe(kind === "context" ? "@praca" : "@doma");
    }
  });
});

describe("odstránenie tokenu", () => {
  it("odstráni token uprostred a zlepí medzeru", () => {
    const r = removeToken("úloha !1 30m", "priority", OPTS);
    expect(r.text).toBe("úloha 30m");
    const parsed = parseCapture(r.text, OPTS);
    expect(parsed.priority).toBeUndefined();
    expect(parsed.estimateMin).toBe(30);
  });

  it("odstráni token na konci bez medzery navyše", () => {
    const r = removeToken("úloha !1", "priority", OPTS);
    expect(r.text).toBe("úloha");
    expect(r.cursor).toBe(5);
  });

  it("odstráni token na začiatku a kurzor dá na nulu", () => {
    const r = removeToken("!1 úloha", "priority", OPTS);
    expect(r.text).toBe("úloha");
    expect(r.cursor).toBe(0);
  });

  it("odstráni termín aj s predložkou", () => {
    const r = removeToken("odovzdať do piatku správu", "due", OPTS);
    expect(r.text).toBe("odovzdať správu");
    expect(parseCapture(r.text, OPTS).dueDate).toBeUndefined();
  });

  it("token, ktorý v texte nie je, nič nepokazí", () => {
    const r = removeToken("kúpiť mlieko", "energy", OPTS);
    expect(r.text).toBe("kúpiť mlieko");
    expect(r.cursor).toBe(12);
    expect(removeToken("", "priority", OPTS)).toEqual({ text: "", cursor: 0 });
  });

  it("nenechá medzeru pred čiarkou", () => {
    const r = removeToken("kúpiť !1, potom uvariť", "priority", OPTS);
    expect(r.text).toBe("kúpiť, potom uvariť");
    expectClean(r.text);
  });
});

describe("activeTokens", () => {
  it("prečíta všetky nastavené druhy naraz", () => {
    expect(activeTokens("kúpiť mlieko !1 !!vysoka 30m @doma do 20.8. 21.8.", OPTS)).toEqual({
      priority: 1,
      energy: "high",
      estimate: 30,
      context: "doma",
      due: "2026-08-20",
      planned: "2026-08-21",
    });
  });

  it("prázdny text a text bez tokenov nemá nič aktívne", () => {
    expect(activeTokens("", OPTS)).toEqual({});
    expect(activeTokens("obyčajná úloha bez ničoho", OPTS)).toEqual({});
  });

  it("kontext vracia bez zavináča", () => {
    expect(activeTokens("úloha @praca", OPTS).context).toBe("praca");
  });

  it("odzrkadľuje vloženie aj odstránenie", () => {
    const added = applyToken("úloha", "energy", "mid", OPTS);
    expect(activeTokens(added.text, OPTS).energy).toBe("mid");

    const removed = removeToken(added.text, "energy", OPTS);
    expect(activeTokens(removed.text, OPTS).energy).toBeUndefined();
  });
});

describe("čistota textu", () => {
  it("po sérii úprav nevzniknú dvojité medzery ani medzera na konci", () => {
    let text = "";
    text = applyToken(text, "priority", 1, OPTS).text;
    text = applyToken(text, "energy", "low", OPTS).text;
    text = applyToken(text, "estimate", 25, OPTS).text;
    text = applyToken(text, "due", "2026-08-20", OPTS).text;
    text = applyToken(text, "context", "doma", OPTS).text;
    text = applyToken(text, "priority", 3, OPTS).text;
    text = removeToken(text, "energy", OPTS).text;
    expectClean(text);

    const parsed = parseCapture(text, OPTS);
    expect(parsed.priority).toBe(3);
    expect(parsed.energy).toBeUndefined();
    expect(parsed.estimateMin).toBe(25);
    expect(parsed.dueDate).toBe("2026-08-20");
    expect(parsed.context).toBe("@doma");
  });

  it("neplatné hodnoty text nechajú tak", () => {
    expect(applyToken("úloha 30m", "estimate", 0, OPTS).text).toBe("úloha 30m");
    expect(applyToken("úloha 30m", "estimate", -5, OPTS).text).toBe("úloha 30m");
    expect(applyToken("úloha", "estimate", Number.NaN, OPTS).text).toBe("úloha");
    expect(applyToken("úloha", "context", "@@@", OPTS).text).toBe("úloha");
  });

  it("bez options funguje tiež — len sa počíta od dnešného dňa", () => {
    const r = applyToken("úloha", "priority", 2);
    expect(r.text).toBe("úloha !2");
    expect(activeTokens("úloha !2").priority).toBe(2);
  });
});

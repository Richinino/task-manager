import { describe, expect, it } from "vitest";

import { buildPushPayload, type ReminderTask } from "./push-payload";

/**
 * Obsah notifikácie sa dá overiť jedine takto.
 *
 * V prehliadači ju uvidíš raz denne a na dve sekundy, na zamknutej obrazovke
 * telefónu. Preklep alebo prázdne telo tam nikto nezachytí — preto je celý
 * text čistá funkcia a preto má testy.
 */
const ZAKLAD: ReminderTask = {
  id: "01a0",
  title: "Zavolať do servisu",
  time: "14:30",
  estimateMin: 30,
  leadMin: 10,
};

describe("buildPushPayload", () => {
  it("nadpis je názov úlohy, nie slovo „Pripomienka“", () => {
    expect(buildPushPayload(ZAKLAD).title).toBe("Zavolať do servisu");
  });

  it("telo hovorí, o koľko to začína a ako dlho to potrvá", () => {
    expect(buildPushPayload(ZAKLAD).body).toBe("O 10 min — o 14:30 · odhad 30 min.");
  });

  it("nulový predstih znamená „teraz“", () => {
    const out = buildPushPayload({ ...ZAKLAD, leadMin: 0 });
    expect(out.body).toBe("Začína teraz, o 14:30 · odhad 30 min.");
  });

  it("dlhší predstih sa píše po ľudsky, nie v minútach", () => {
    const out = buildPushPayload({ ...ZAKLAD, leadMin: 90 });
    expect(out.body).toContain("O 1 h 30 min");
  });

  it("bez odhadu ostáva aspoň čas", () => {
    const out = buildPushPayload({ ...ZAKLAD, estimateMin: null });
    expect(out.body).toBe("O 10 min — o 14:30.");
  });

  it("bez času aj bez odhadu má telo stále dôvod, prečo prišla", () => {
    const out = buildPushPayload({ ...ZAKLAD, time: null, estimateMin: null });
    expect(out.body).toBe("Naplánoval si to na teraz.");
    expect(out.body).not.toBe("");
  });

  /*
    Prázdny nadpis by na zamknutej obrazovke vyzeral ako pokazená appka.
    Do databázy sa síce nedostane, ale notifikácia je posledné miesto,
    kde sa to dá ešte zachytiť.
  */
  it("prázdny názov nikdy nevytvorí prázdny nadpis", () => {
    expect(buildPushPayload({ ...ZAKLAD, title: "" }).title).toBe("Úloha bez názvu");
    expect(buildPushPayload({ ...ZAKLAD, title: "   " }).title).toBe("Úloha bez názvu");
  });

  it("obalové medzery v názve sa orežú", () => {
    expect(buildPushPayload({ ...ZAKLAD, title: "  Kúpiť mlieko  " }).title).toBe(
      "Kúpiť mlieko",
    );
  });

  it("značka je odvodená od úlohy, takže druhá notifikácia prvú nahradí", () => {
    const a = buildPushPayload(ZAKLAD);
    const b = buildPushPayload({ ...ZAKLAD, time: "15:00" });
    expect(a.tag).toBe("uloha-01a0");
    expect(b.tag).toBe(a.tag);
  });

  it("dve rôzne úlohy sa nezoskupia do jednej", () => {
    const a = buildPushPayload(ZAKLAD);
    const b = buildPushPayload({ ...ZAKLAD, id: "01b0" });
    expect(a.tag).not.toBe(b.tag);
  });

  it("otvára sa „Dnes“ — vtedy chceš vidieť celý deň, nie jednu kartu", () => {
    expect(buildPushPayload(ZAKLAD).url).toBe("/dnes");
  });
});

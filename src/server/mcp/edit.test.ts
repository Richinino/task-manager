import { describe, expect, it } from "vitest";

import {
  agendaCreateInput,
  agendaForm,
  changedFields,
  kindAndType,
  lessonSlotWanted,
  planAgendaEdit,
  resolveNamed,
  tagChanges,
  taskPatch,
  type AgendaState,
} from "./edit";

/*
  Úpravy cez MCP. Chyba v týchto prevodoch je tichá: model dostane „ok“,
  a pritom sa vymaže pole, ktoré poslať nechcel, alebo písomka stratí
  hodinu z rozvrhu. Preklad ani UI ju nechytia.
*/

const OBLASTI = [
  { id: "a1", name: "Práca" },
  { id: "a2", name: "Zdravie" },
];
const PREDMETY = [
  { id: "s1", name: "MAT", alt: "Matematika" },
  { id: "s2", name: "FYZ", alt: "Fyzika" },
];

describe("resolveNamed", () => {
  it("null aj prázdne meno znamená odobrať", () => {
    expect(resolveNamed("area", null, OBLASTI)).toEqual({ ok: true, id: null });
    expect(resolveNamed("area", "  ", OBLASTI)).toEqual({ ok: true, id: null });
  });

  it("meno bez ohľadu na veľkosť písmen a diakritiku", () => {
    expect(resolveNamed("area", "praca", OBLASTI)).toEqual({ ok: true, id: "a1" });
    expect(resolveNamed("area", " ZDRAVIE ", OBLASTI)).toEqual({ ok: true, id: "a2" });
  });

  it("id platí tiež", () => {
    expect(resolveNamed("area", "a2", OBLASTI)).toEqual({ ok: true, id: "a2" });
  });

  it("predmet skratkou aj celým názvom", () => {
    expect(resolveNamed("subject", "mat", PREDMETY)).toEqual({ ok: true, id: "s1" });
    expect(resolveNamed("subject", "Fyzika", PREDMETY)).toEqual({ ok: true, id: "s2" });
  });

  it("projekt so zápisom zo zachytenia (+Projekt)", () => {
    expect(resolveNamed("project", "+Web", [{ id: "p1", name: "Web" }])).toEqual({ ok: true, id: "p1" });
  });

  it("nedomýšľa — začiatok mena nestačí", () => {
    const result = resolveNamed("area", "Prá", OBLASTI);
    expect(result.ok).toBe(false);
  });

  it("neznáme meno vymenuje platné", () => {
    const result = resolveNamed("subject", "Chémia", PREDMETY);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("Predmet „Chémia“ sa nenašiel.");
      expect(result.error).toContain("MAT (Matematika), FYZ (Fyzika)");
    }
  });

  it("bez možností povie, kde sa zakladajú", () => {
    const result = resolveNamed("project", "Web", []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Nemáš žiadny aktívny projekt");
  });

  it("dve rovnaké mená — pýta id, nevyberá náhodne", () => {
    const result = resolveNamed("project", "web", [
      { id: "p1", name: "Web" },
      { id: "p2", name: "WEB" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("[p1]");
  });
});

describe("taskPatch", () => {
  const uloha = { note: "Prvý odsek.", allDay: false };

  it("v záplate je len to, čo prišlo", () => {
    const result = taskPatch(uloha, { title: "  Nový názov ", priority: 1 });
    expect(result).toEqual({ ok: true, patch: { title: "Nový názov", priority: 1 } });
  });

  it("null pole vymaže, undefined nechá", () => {
    const result = taskPatch(uloha, { due: null, estimate_min: null, energy: undefined });
    expect(result).toEqual({ ok: true, patch: { dueDate: null, estimateMin: null } });
  });

  it("prázdna poznámka a kontext sú null, nie prázdny text", () => {
    const result = taskPatch(uloha, { note: "  ", context: " " });
    expect(result).toEqual({ ok: true, patch: { note: null, context: null } });
  });

  it("append_note doplní za celú uloženú poznámku", () => {
    expect(taskPatch(uloha, { append_note: "Druhý." })).toEqual({
      ok: true,
      patch: { note: "Prvý odsek.\n\nDruhý." },
    });
    expect(taskPatch({ note: null, allDay: false }, { append_note: " Len toto " })).toEqual({
      ok: true,
      patch: { note: "Len toto" },
    });
  });

  it("note a append_note naraz je chyba", () => {
    expect(taskPatch(uloha, { note: "x", append_note: "y" }).ok).toBe(false);
  });

  it("celý deň s hodinou je protirečenie", () => {
    expect(taskPatch(uloha, { all_day: true, time: "10:00" }).ok).toBe(false);
    expect(taskPatch(uloha, { all_day: true, time: null })).toEqual({
      ok: true,
      patch: { plannedTime: null, allDay: true },
    });
  });

  it("hodina na celodennej úlohe z nej spraví časovanú", () => {
    expect(taskPatch({ note: null, allDay: true }, { time: "14:30" })).toEqual({
      ok: true,
      patch: { plannedTime: "14:30", allDay: false },
    });
  });

  it("preložené mená idú do id polí, null odoberá", () => {
    expect(taskPatch(uloha, {}, { projectId: "p1", areaId: null })).toEqual({
      ok: true,
      patch: { projectId: "p1", areaId: null },
    });
  });
});

describe("tagChanges", () => {
  const stitky = [
    { id: "t1", name: "Rodina" },
    { id: "t2", name: "Škola" },
  ];

  it("pridá len nové, bez mriežky a bez duplicít", () => {
    expect(tagChanges(stitky, ["#rodina", "Nákup", "nakup", " "], [])).toEqual({
      ok: true,
      add: ["Nákup"],
      removeIds: [],
    });
  });

  it("odoberá podľa mena, zapisuje id", () => {
    expect(tagChanges(stitky, [], ["skola"])).toEqual({ ok: true, add: [], removeIds: ["t2"] });
  });

  it("štítok, ktorý úloha nemá, je chyba s jej štítkami", () => {
    const result = tagChanges(stitky, [], ["Práca"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Má: Rodina, Škola.");
  });

  it("naraz pridať aj odobrať ten istý nejde", () => {
    expect(tagChanges(stitky, ["Rodina"], ["rodina"]).ok).toBe(false);
  });
});

describe("changedFields", () => {
  it("vráti len polia, ktoré sa naozaj zmenili", () => {
    expect(changedFields({ a: 1, b: [1], c: null }, { a: 1, b: [2], d: undefined })).toEqual(["b"]);
    expect(changedFields({ note: "x" }, {})).toEqual(["note"]);
  });
});

describe("kindAndType", () => {
  const pisomka = { kind: "event" as const, type: "exam" as const };
  const deadline = { kind: "deadline" as const, type: "submit" as const };

  it("typ napovie druh", () => {
    expect(kindAndType(pisomka, undefined, "submit")).toEqual({ ok: true, kind: "deadline", type: "submit" });
    expect(kindAndType(deadline, undefined, "oral")).toEqual({ ok: true, kind: "event", type: "oral" });
    expect(kindAndType(null, undefined, undefined)).toEqual({ ok: true, kind: "event", type: "other" });
  });

  it("zmena druhu prepne nehodiaci sa typ na „iné“", () => {
    expect(kindAndType(pisomka, "deadline")).toEqual({ ok: true, kind: "deadline", type: "other" });
    expect(kindAndType(deadline, "event")).toEqual({ ok: true, kind: "event", type: "other" });
  });

  it("rozpor je chyba", () => {
    expect(kindAndType(null, "deadline", "exam").ok).toBe(false);
    expect(kindAndType(null, "event", "submit").ok).toBe(false);
  });
});

describe("agendaCreateInput", () => {
  it("písomka: udalosť s pripomienkou večer vopred, čas nechá rozvrhu", () => {
    const result = agendaCreateInput({ title: " Písomka — funkcie ", date: "2026-10-05", type: "exam" }, "s1");
    expect(result).toEqual({
      ok: true,
      input: {
        kind: "event",
        type: "exam",
        title: "Písomka — funkcie",
        note: null,
        date: "2026-10-05",
        endDate: null,
        startTime: null,
        endTime: null,
        place: null,
        subjectId: "s1",
        remind: "eve",
      },
    });
  });

  it("odovzdanie je deadline s hodinou „do“ a bez pripomienky", () => {
    const result = agendaCreateInput({ title: "Referát", date: "2026-10-02", type: "submit", end_time: "23:59" }, null);
    expect(result).toMatchObject({
      ok: true,
      input: { kind: "deadline", type: "submit", startTime: null, endTime: "23:59", remind: null },
    });
  });

  it("výlet cez viac dní berie blocks_day", () => {
    const result = agendaCreateInput(
      { title: "Tatry", date: "2026-10-05", end_date: "2026-10-07", blocks_day: true },
      null,
    );
    expect(result).toMatchObject({ ok: true, input: { endDate: "2026-10-07", blocksDay: true } });
  });

  it("nezmysly sú chyba, nie tichá oprava", () => {
    expect(agendaCreateInput({ title: "x", date: "2026-10-02", kind: "deadline", start_time: "10:00" }, null).ok).toBe(false);
    expect(agendaCreateInput({ title: "x", date: "2026-10-05", end_date: "2026-10-01" }, null).ok).toBe(false);
    expect(agendaCreateInput({ title: "x", date: "2026-10-05", start_time: "11:00", end_time: "10:00" }, null).ok).toBe(false);
  });
});

/** Písomka na 3. hodine — čas z rozvrhu. */
function pisomka(patch: Partial<AgendaState> = {}): AgendaState {
  return {
    kind: "event",
    type: "exam",
    title: "Písomka",
    note: null,
    date: "2026-10-09",
    endDate: null,
    startTime: "09:50:00",
    endTime: "10:35:00",
    period: 3,
    place: "U12",
    subjectId: "s1",
    blocksDay: false,
    remind: "eve",
    cancelledAt: null,
    grade: null,
    ...patch,
  };
}

describe("planAgendaEdit", () => {
  it("samotný nový deň je len presun", () => {
    expect(planAgendaEdit(pisomka(), { date: "2026-10-12" })).toEqual({ ok: true, move: "2026-10-12", form: false });
  });

  it("rovnaké hodnoty nič nezapisujú", () => {
    expect(
      planAgendaEdit(pisomka(), { place: "U12", title: "Písomka", start_time: "09:50", cancelled: false, date: "2026-10-09" }),
    ).toEqual({ ok: true, move: null, form: false });
  });

  it("po presune ide formulár aj s „rovnakým“ časom — presun ho mohol prepočítať", () => {
    expect(planAgendaEdit(pisomka(), { date: "2026-10-12", start_time: "09:50" })).toMatchObject({
      move: "2026-10-12",
      form: true,
    });
  });

  it("zmena predmetu ide cez formulár", () => {
    expect(planAgendaEdit(pisomka(), {}, "s2")).toMatchObject({ form: true });
    expect(planAgendaEdit(pisomka(), {}, "s1")).toMatchObject({ form: false });
  });

  it("zrušenie len keď sa stav mení", () => {
    expect(planAgendaEdit(pisomka(), { cancelled: true })).toMatchObject({ cancelled: true });
    expect(planAgendaEdit(pisomka({ cancelledAt: new Date() }), { cancelled: true })).not.toHaveProperty("cancelled");
  });

  it("poznámka k známke nechá známku tak", () => {
    expect(planAgendaEdit(pisomka({ grade: 2 }), { grade_note: "chyba v zlomkoch" })).toMatchObject({
      grade: { grade: 2, note: "chyba v zlomkoch" },
    });
    expect(planAgendaEdit(pisomka({ grade: 2 }), { grade: null })).toMatchObject({ grade: { grade: null } });
  });

  it("známka k výletu nie", () => {
    expect(planAgendaEdit(pisomka({ type: "other" }), { grade: 1 }).ok).toBe(false);
    expect(planAgendaEdit(pisomka(), { type: "other", grade: 1 }).ok).toBe(false);
  });

  it("viacdňová sa posúva celá — koniec pred novým začiatkom je chyba", () => {
    const vylet = pisomka({ type: "other", period: null, date: "2026-10-05", endDate: "2026-10-07" });
    expect(planAgendaEdit(vylet, { date: "2026-10-12" })).toMatchObject({ ok: true, form: false });
    expect(planAgendaEdit(vylet, { date: "2026-10-12", end_date: "2026-10-10" }).ok).toBe(false);
    expect(planAgendaEdit(vylet, { date: "2026-10-12", end_date: "2026-10-14" })).toMatchObject({
      ok: true,
      move: "2026-10-12",
    });
  });

  it("deadline nemá začiatok", () => {
    const d = pisomka({ kind: "deadline", type: "submit", period: null, startTime: null });
    expect(planAgendaEdit(d, { start_time: "10:00" }).ok).toBe(false);
    expect(planAgendaEdit(d, { end_time: "20:00" })).toMatchObject({ ok: true, form: true });
  });
});

describe("lessonSlotWanted a agendaForm", () => {
  it("písomka na hodine pri zmene názvu pýta hodinu, aby neprišla o väzbu", () => {
    expect(lessonSlotWanted(pisomka(), { title: "Písomka — zlomky" })).toEqual({ subjectId: "s1", date: "2026-10-09" });
    const form = agendaForm(pisomka(), { title: "Písomka — zlomky" }, undefined, { room: "U12" });
    expect(form).toMatchObject({ title: "Písomka — zlomky", startTime: null, endTime: null, place: "U12", subjectId: "s1" });
  });

  it("keď hodina v ten deň už nie je, čas ostane", () => {
    const form = agendaForm(pisomka(), { note: "kapitola 3" }, undefined, null);
    expect(form).toMatchObject({ startTime: "09:50", endTime: "10:35", note: "kapitola 3" });
  });

  it("výslovný čas sa nikdy neprepíše rozvrhom", () => {
    expect(lessonSlotWanted(pisomka(), { start_time: "08:00" })).toBeNull();
    const form = agendaForm(pisomka(), { start_time: "08:00" }, undefined, { room: "U12" });
    expect(form).toMatchObject({ startTime: "08:00", endTime: "10:35" });
  });

  it("ručný čas (bez hodiny) ostáva, aj keď sa mení predmet", () => {
    const rucna = pisomka({ period: null, startTime: "14:00:00", endTime: "15:00:00" });
    expect(lessonSlotWanted(rucna, {}, "s2")).toBeNull();
    expect(agendaForm(rucna, {}, "s2", null)).toMatchObject({ startTime: "14:00", subjectId: "s2" });
  });

  it("nový predmet si vezme učebňu svojej hodiny", () => {
    const form = agendaForm(pisomka(), {}, "s2", { room: "Lab" });
    expect(form).toMatchObject({ subjectId: "s2", startTime: null, place: "Lab" });
    expect(agendaForm(pisomka(), { place: "Aula" }, "s2", { room: "Lab" })).toMatchObject({ place: "Aula" });
  });

  it("deadline nikdy nemá začiatok, pripomienka ostáva", () => {
    const form = agendaForm(pisomka(), { kind: "deadline" }, undefined, null);
    expect(form).toMatchObject({ kind: "deadline", type: "other", startTime: null, remind: "eve", blocksDay: false });
  });

  it("neznáma pripomienka sa neposiela", () => {
    expect(agendaForm(pisomka({ remind: "zle" }), {}, undefined, null)).toMatchObject({ remind: null });
  });
});

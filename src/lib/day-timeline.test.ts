import { describe, expect, it } from "vitest";

import { timeToMinutes } from "./dates";
import {
  findSlot,
  layoutDay,
  type DayTimeline,
  type TimelineBusy,
  type TimelineInput,
  type TimelineTask,
} from "./day-timeline";

const min = (t: string): number => timeToMinutes(t)!;

function task(id: string, over: Partial<TimelineTask> = {}): TimelineTask {
  return {
    id,
    title: id,
    estimateMin: 30,
    fixedStartMin: null,
    isFrog: false,
    areaColor: null,
    done: false,
    ...over,
  };
}

function busy(id: string, kind: TimelineBusy["kind"], from: string, to: string): TimelineBusy {
  return { id, kind, label: id, startMin: min(from), endMin: min(to) };
}

function input(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    dayStartMin: min("08:00"),
    dayEndMin: min("18:00"),
    nowMin: null,
    busy: [],
    tasks: [],
    ...over,
  };
}

const span = (d: DayTimeline, id: string) => {
  const b = d.blocks.find((x) => x.id === id);
  return b ? [b.startMin, b.endMin] : null;
};

describe("layoutDay", () => {
  it("prázdny deň je jedno veľké voľné miesto", () => {
    const d = layoutDay(input());
    expect(d.blocks).toEqual([]);
    expect(d.gaps).toEqual([{ startMin: 480, endMin: 1080 }]);
    expect(d.freeMin).toBe(600);
    expect(d.plannedMin).toBe(0);
  });

  it("škola ráno, teraz je prestávka: úloha ide až za hodinu", () => {
    const d = layoutDay(
      input({
        nowMin: min("09:00"),
        busy: [busy("h1", "lesson", "08:00", "08:45"), busy("h2", "lesson", "09:00", "09:45")],
        tasks: [task("a", { estimateMin: 60 })],
      }),
    );
    expect(span(d, "a")).toEqual([min("09:45"), min("10:45")]);
    expect(d.blocks.find((b) => b.id === "h1")?.past).toBe(true);
    expect(d.blocks.find((b) => b.id === "h2")?.past).toBe(false);
  });

  it("priorita dňa dostane najskoršie miesto, aj keď je v zozname posledná", () => {
    const d = layoutDay(
      input({
        tasks: [task("a"), task("b"), task("zaba", { isFrog: true, estimateMin: 90 })],
      }),
    );
    expect(span(d, "zaba")).toEqual([min("08:00"), min("09:30")]);
    expect(span(d, "a")).toEqual([min("09:30"), min("10:00")]);
    expect(d.blocks.find((b) => b.id === "zaba")?.isFrog).toBe(true);
  });

  it("úloha bez odhadu je nezaradená", () => {
    const d = layoutDay(input({ tasks: [task("a", { estimateMin: null })] }));
    expect(d.unplaced.map((t) => t.id)).toEqual(["a"]);
    expect(d.blocks).toEqual([]);
    expect(d.plannedMin).toBe(0);
  });

  it("príliš dlhá úloha sa nedelí, je nezaradená", () => {
    const d = layoutDay(
      input({
        busy: [busy("m", "meeting", "10:00", "11:00")],
        dayEndMin: min("12:00"),
        tasks: [task("dlha", { estimateMin: 150 }), task("kratka", { estimateMin: 60 })],
      }),
    );
    expect(d.unplaced.map((t) => t.id)).toEqual(["dlha"]);
    expect(span(d, "kratka")).toEqual([min("08:00"), min("09:00")]);
  });

  it("úloha s pevným časom stojí tam, kde je, aj cez poradu", () => {
    const d = layoutDay(
      input({
        busy: [busy("m", "meeting", "10:00", "11:00")],
        tasks: [
          task("f", { fixedStartMin: min("10:30"), estimateMin: 60 }),
          task("n", { estimateMin: null, fixedStartMin: min("14:00") }),
        ],
      }),
    );
    expect(span(d, "f")).toEqual([min("10:30"), min("11:30")]);
    expect(span(d, "n")).toEqual([min("14:00"), min("14:30")]);
    expect(d.plannedMin).toBe(90);
  });

  it("pevný čas blokuje miesto pre ostatné úlohy", () => {
    const d = layoutDay(
      input({
        tasks: [
          task("a", { estimateMin: 60 }),
          task("f", { fixedStartMin: min("08:00"), estimateMin: 60 }),
        ],
      }),
    );
    expect(span(d, "f")).toEqual([min("08:00"), min("09:00")]);
    expect(span(d, "a")).toEqual([min("09:00"), min("10:00")]);
  });

  it("fakty sa orežú na okno dňa a prázdne zmiznú", () => {
    const d = layoutDay(
      input({
        busy: [
          busy("skoro", "event", "07:00", "08:30"),
          busy("neskoro", "event", "17:30", "19:00"),
          busy("pred", "event", "06:00", "07:00"),
          busy("po", "event", "18:00", "19:00"),
        ],
      }),
    );
    expect(d.blocks.map((b) => [b.id, b.startMin, b.endMin])).toEqual([
      ["skoro", min("08:00"), min("08:30")],
      ["neskoro", min("17:30"), min("18:00")],
    ]);
  });

  it("prekrývajúce sa fakty ostanú oba", () => {
    const d = layoutDay(
      input({
        busy: [busy("a", "lesson", "09:00", "10:00"), busy("b", "meeting", "09:30", "10:30")],
      }),
    );
    expect(d.blocks).toHaveLength(2);
    expect(d.freeMin).toBe(600 - 90);
  });

  it("hotové úlohy sa neumiestnia ani nepočítajú", () => {
    const d = layoutDay(input({ tasks: [task("x", { done: true, estimateMin: 120 })] }));
    expect(d.blocks).toEqual([]);
    expect(d.unplaced).toEqual([]);
    expect(d.plannedMin).toBe(0);
  });

  it("príznak past: koniec <= teraz; bez nowMin nič nie je minulé", () => {
    const base = {
      busy: [busy("a", "event", "08:00", "09:00"), busy("b", "event", "09:00", "10:00")],
    };
    const dnes = layoutDay(input({ ...base, nowMin: min("09:00") }));
    expect(dnes.blocks.map((b) => b.past)).toEqual([true, false]);
    const ine = layoutDay(input({ ...base, nowMin: null }));
    expect(ine.blocks.map((b) => b.past)).toEqual([false, false]);
  });

  it("úlohy a medzery sa rátajú len po teraz", () => {
    const d = layoutDay(input({ nowMin: min("12:00"), tasks: [task("a", { estimateMin: 30 })] }));
    expect(span(d, "a")).toEqual([min("12:00"), min("12:30")]);
    expect(d.gaps).toEqual([{ startMin: min("12:30"), endMin: min("18:00") }]);
    expect(d.freeMin).toBe(330);
    expect(d.plannedMin).toBe(30);
  });

  it("medzery pod 5 minút sa ignorujú", () => {
    const d = layoutDay(
      input({
        dayEndMin: min("10:00"),
        busy: [
          busy("a", "lesson", "08:00", "08:45"),
          busy("b", "lesson", "08:48", "09:30"),
          busy("c", "lesson", "09:35", "10:00"),
        ],
      }),
    );
    // Medzery majú 3 a 5 minút: počíta sa len päťminútová.
    expect(d.gaps).toEqual([{ startMin: min("09:30"), endMin: min("09:35") }]);
    expect(d.freeMin).toBe(5);
  });

  it("bloky sú zoradené podľa začiatku, potom podľa druhu", () => {
    const d = layoutDay(
      input({
        busy: [busy("e", "event", "09:00", "09:30"), busy("l", "lesson", "09:00", "09:45")],
        tasks: [task("t", { fixedStartMin: min("09:00") })],
      }),
    );
    expect(d.blocks.map((b) => b.kind)).toEqual(["lesson", "event", "task"]);
  });
});

describe("findSlot", () => {
  it("nájde najskoršie miesto po umiestnených úlohách a orezá ho", () => {
    const d = layoutDay(
      input({
        busy: [busy("m", "meeting", "08:00", "09:00")],
        tasks: [task("a", { estimateMin: 45 })],
      }),
    );
    expect(findSlot(d, 20)).toEqual({ startMin: min("09:45"), endMin: min("10:05") });
  });

  it("preskočí príliš malé medzery", () => {
    const d = layoutDay(
      input({
        dayEndMin: min("12:00"),
        busy: [busy("a", "lesson", "08:00", "09:00"), busy("b", "lesson", "09:15", "10:00")],
      }),
    );
    expect(findSlot(d, 30)).toEqual({ startMin: min("10:00"), endMin: min("10:30") });
  });

  it("vráti null, keď sa nezmestí, alebo pri neplatnej dĺžke", () => {
    const d = layoutDay(input({ dayEndMin: min("09:00") }));
    expect(findSlot(d, 90)).toBeNull();
    expect(findSlot(d, 0)).toBeNull();
  });
});

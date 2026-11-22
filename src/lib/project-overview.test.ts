import { describe, expect, it } from "vitest";

import {
  bucketProjectTasks,
  projectDeadlineLabel,
  projectProgressLabel,
  projectProgressPercent,
} from "./project-overview";

const t = (id: string, o: Partial<{ status: string; isFrog: boolean; dueDate: string | null }> = {}) => ({
  id,
  status: "todo",
  isFrog: false,
  dueDate: null,
  ...o,
});

describe("bucketProjectTasks", () => {
  it("ďalší krok je priorita dňa, inak najbližší dátum", () => {
    const a = t("a", { dueDate: "2026-12-05" });
    const b = t("b", { dueDate: "2026-12-02" });
    expect(bucketProjectTasks([a, b]).next?.id).toBe("b");
    const c = t("c", { isFrog: true });
    expect(bucketProjectTasks([a, b, c]).next?.id).toBe("c");
  });

  it("delí na naplánované, bez dátumu a hotové", () => {
    const r = bucketProjectTasks([
      t("a", { dueDate: "2026-12-02" }),
      t("b", { dueDate: "2026-12-03" }),
      t("c"),
      t("d", { status: "done" }),
    ]);
    expect(r.next?.id).toBe("a");
    expect(r.scheduled.map((x) => x.id)).toEqual(["b"]);
    expect(r.undated.map((x) => x.id)).toEqual(["c"]);
    expect(r.done.map((x) => x.id)).toEqual(["d"]);
  });

  it("prázdny projekt nemá ďalší krok", () => {
    expect(bucketProjectTasks([]).next).toBeNull();
  });
});

describe("projectDeadlineLabel", () => {
  it("skloňuje dni", () => {
    expect(projectDeadlineLabel("2026-12-15", "2026-11-22")).toBe("termín 15. 12., o 23 dní");
    expect(projectDeadlineLabel("2026-11-23", "2026-11-22")).toBe("termín 23. 11., zajtra");
    expect(projectDeadlineLabel("2026-11-19", "2026-11-22")).toBe("termín 19. 11., 3 dni po termíne");
  });
});

describe("progress", () => {
  it("počíta", () => {
    expect(projectProgressLabel(4, 9)).toBe("4 z 9 hotové");
    expect(projectProgressLabel(0, 0)).toBe("zatiaľ bez úloh");
    expect(projectProgressPercent(4, 9)).toBe(44);
    expect(projectProgressPercent(0, 0)).toBe(0);
  });
});

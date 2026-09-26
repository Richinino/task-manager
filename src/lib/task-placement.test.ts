import { describe, expect, it } from "vitest";

import {
  hasPlace,
  horizonForDate,
  isOrphaned,
  visibleStatus,
  type PlacementFields,
} from "@/lib/task-placement";

const TODAY = "2026-09-25";

describe("horizonForDate", () => {
  it("dnes a zajtra sú deň", () => {
    expect(horizonForDate("2026-09-25", TODAY)).toBe("day");
    expect(horizonForDate("2026-09-26", TODAY)).toBe("day");
  });

  it("minulosť je tiež deň — prepadnutá úloha je dnešná starosť", () => {
    expect(horizonForDate("2026-09-01", TODAY)).toBe("day");
  });

  it("do siedmich dní je týždeň, aj cez hranicu mesiaca", () => {
    expect(horizonForDate("2026-09-30", TODAY)).toBe("week");
    expect(horizonForDate("2026-10-02", TODAY)).toBe("week");
  });

  it("deň za týždňom v ďalšom mesiaci NIE JE niekedy", () => {
    // Presne takto skončila úloha na 9. 10. medzi odloženými.
    expect(horizonForDate("2026-10-09", TODAY)).toBe("month");
    expect(horizonForDate("2027-03-01", TODAY)).toBe("month");
  });
});

const BASE: PlacementFields = {
  status: "todo",
  plannedDate: null,
  projectId: null,
  horizon: "week",
  parentTaskId: null,
};

describe("isOrphaned / visibleStatus", () => {
  it("otvorená úloha bez dňa, projektu a mimo niekedy je stratená", () => {
    expect(isOrphaned(BASE)).toBe(true);
    expect(visibleStatus(BASE)).toBe("inbox");
    expect(visibleStatus({ ...BASE, status: "doing" })).toBe("inbox");
  });

  it("deň, projekt, niekedy aj rodič dávajú miesto", () => {
    expect(isOrphaned({ ...BASE, plannedDate: TODAY })).toBe(false);
    expect(isOrphaned({ ...BASE, projectId: "p" })).toBe(false);
    expect(isOrphaned({ ...BASE, horizon: "someday" })).toBe(false);
    expect(isOrphaned({ ...BASE, parentTaskId: "t" })).toBe(false);
  });

  it("uzavreté, čakajúce a inboxové sa nemenia", () => {
    for (const status of ["done", "dropped", "waiting", "inbox"] as const) {
      expect(isOrphaned({ ...BASE, status })).toBe(false);
      expect(visibleStatus({ ...BASE, status })).toBe(status);
    }
  });
});

describe("hasPlace", () => {
  it("čakanie je samo osebe miesto", () => {
    expect(hasPlace({ ...BASE, status: "waiting" })).toBe(true);
  });

  it("bez čohokoľvek miesto nie je", () => {
    expect(hasPlace(BASE)).toBe(false);
  });
});

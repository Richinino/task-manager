import { describe, expect, it } from "vitest";

import { REFRESH_ON_RETURN_MIN_GAP_MS, shouldRefreshOnReturn } from "./refresh-on-return";

describe("shouldRefreshOnReturn", () => {
  it("obnoví, keď od posledného obnovenia prešiel dosť dlhý čas", () => {
    expect(shouldRefreshOnReturn(0, REFRESH_ON_RETURN_MIN_GAP_MS)).toBe(true);
    expect(shouldRefreshOnReturn(0, 60_000)).toBe(true);
  });

  it("neobnoví druhýkrát pri tom istom návrate (focus + visibilitychange)", () => {
    expect(shouldRefreshOnReturn(1_000, 1_050)).toBe(false);
  });

  it("neobnoví tesne pred hranicou", () => {
    expect(shouldRefreshOnReturn(0, REFRESH_ON_RETURN_MIN_GAP_MS - 1)).toBe(false);
  });

  it("rešpektuje vlastný odstup", () => {
    expect(shouldRefreshOnReturn(0, 3_000, 2_000)).toBe(true);
    expect(shouldRefreshOnReturn(0, 1_000, 2_000)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { getParticipationFieldCandidates, getParticipationQuantity } from "./legacyBusinessRules";

describe("legacyBusinessRules participation helpers", () => {
  it("resolves canonical field first", () => {
    expect(
      getParticipationQuantity(
        {
          studentsQuantity: 99,
          participation_festa_50: 42,
          participation_festa50: 10,
        },
        "festa_50",
        0,
      ),
    ).toBe(42);
  });

  it("falls back to legacy alias fields when needed", () => {
    expect(
      getParticipationQuantity(
        {
          studentsQuantity: 99,
          participation_festa365: 36,
        },
        "festa_365",
        0,
      ),
    ).toBe(36);
  });

  it("exposes canonical and legacy candidates in order", () => {
    expect(getParticipationFieldCandidates("missa_culto")).toEqual([
      "participation_missa",
      "participation_missa_culto",
    ]);
  });
});

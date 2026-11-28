import { describe, expect, it } from "vitest";
import { weightedPercent } from "@/lib/academics";
import { reportSetsFromForm } from "@/lib/report-card-shares";

function formWithShares(shares: [string, string][]) {
  const formData = new FormData();
  for (const [key, share] of shares) {
    formData.append("set", key);
    formData.append(`share:${key}`, share);
  }
  return formData;
}

describe("report-card assessment shares", () => {
  it("allows a zero-share assessment when the chosen shares total 100%", () => {
    expect(reportSetsFromForm(formWithShares([["supplemental", "0"], ["term", "100"]]))).toEqual({
      sets: [
        { key: "supplemental", share: 0, sort: 0 },
        { key: "term", share: 100, sort: 1 },
      ],
    });
  });

  it("preserves the assessment order submitted by the dialog", () => {
    const result = reportSetsFromForm(formWithShares([["endterm", "70"], ["midterm", "30"]]));
    expect("sets" in result ? result.sets.map((set) => set.key) : []).toEqual(["endterm", "midterm"]);
  });

  it("rejects negative shares and totals other than 100%", () => {
    expect(reportSetsFromForm(formWithShares([["term", "-1"], ["final", "101"]]))).toHaveProperty("error");
    expect(reportSetsFromForm(formWithShares([["term", "0"], ["final", "50"]]))).toHaveProperty("error");
  });

  it("does not let a zero-share assessment affect the computed percentage", () => {
    expect(weightedPercent([
      { score: 60, max: 100, weight: 100, missed: false },
      { score: 100, max: 100, weight: 0, missed: false },
    ])).toBe(60);
  });
});

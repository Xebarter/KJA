import { describe, expect, it } from "vitest";
import { shouldExpandOtherMarkbooks } from "@/lib/marks-workbook-export";

describe("shouldExpandOtherMarkbooks", () => {
  it("does not add other subjects to a single-subject workbook", () => {
    expect(shouldExpandOtherMarkbooks(["math"])).toBe(false);
    expect(shouldExpandOtherMarkbooks(["math", "math"])).toBe(false);
  });

  it("adds other subjects for a multi-subject workbook", () => {
    expect(shouldExpandOtherMarkbooks(["math", "english"])).toBe(true);
  });
});

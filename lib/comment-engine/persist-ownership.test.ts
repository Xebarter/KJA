import { describe, expect, it } from "vitest";
import { engineOwnsRemark } from "./persist";

describe("engineOwnsRemark", () => {
  it("owns blank remarks", () => {
    expect(engineOwnsRemark(null, "old ai", "template")).toBe(true);
    expect(engineOwnsRemark("   ", null, null)).toBe(true);
  });

  it("owns the last AI text so it can be rewritten", () => {
    expect(engineOwnsRemark("Amina works hard.", "Amina works hard.", "Template text.")).toBe(true);
  });

  it("owns legacy template text from before AI was wired in", () => {
    expect(engineOwnsRemark("Template text.", null, "Template text.")).toBe(true);
  });

  it("never owns a manually typed or uploaded remark", () => {
    expect(engineOwnsRemark("Typed by the class teacher.", "Old AI text.", "Template text.")).toBe(false);
    expect(engineOwnsRemark("Typed by the class teacher.", null, null)).toBe(false);
  });
});

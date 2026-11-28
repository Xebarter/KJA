import { describe, expect, it } from "vitest";
import { planColumnTitles, setColumnRem, shortSetTitle } from "@/lib/report-column-titles";

describe("shortSetTitle", () => {
  it("maps the usual sittings to fixed codes", () => {
    expect(shortSetTitle("Beginning of term")).toBe("BOT");
    expect(shortSetTitle("BOT examinations")).toBe("BOT");
    expect(shortSetTitle("Midterm examinations")).toBe("MID");
    expect(shortSetTitle("Mid-term")).toBe("MID");
    expect(shortSetTitle("End of term examinations")).toBe("EOT");
    expect(shortSetTitle("Endterm")).toBe("EOT");
    expect(shortSetTitle("Class test")).toBe("TEST");
    expect(shortSetTitle("Test 2")).toBe("T2");
  });

  it("falls back to a truncation or initials for custom names", () => {
    expect(shortSetTitle("Projects")).toBe("PROJ.");
    expect(shortSetTitle("Oral")).toBe("ORAL");
    expect(shortSetTitle("Practical skills review")).toBe("PSR");
    expect(shortSetTitle("   ")).toBe("");
  });
});

describe("planColumnTitles", () => {
  it("keeps the full label and flags abbreviations", () => {
    const [mid, oral] = planColumnTitles([
      { key: "a", label: "Midterm examinations" },
      { key: "b", label: "Oral" },
    ]);
    expect(mid).toMatchObject({ short: "MID", full: "Midterm examinations", abbreviated: true });
    expect(oral).toMatchObject({ short: "ORAL", abbreviated: false });
  });

  it("makes duplicate codes unique", () => {
    const titles = planColumnTitles([
      { key: "a", label: "Midterm one" },
      { key: "b", label: "Midterm two" },
      { key: "c", label: "End of term" },
    ]);
    expect(titles.map((title) => title.short)).toEqual(["MID1", "MID2", "EOT"]);
  });

  it("uses a custom report_header when provided", () => {
    const [bot, eot] = planColumnTitles([
      { key: "a", label: "Beginning of term examinations", report_header: "SET 1" },
      { key: "b", label: "Final", report_header: "Final" },
    ]);
    expect(bot).toMatchObject({ short: "SET 1", full: "Beginning of term examinations", abbreviated: true });
    expect(eot).toMatchObject({ short: "Final", full: "Final", abbreviated: false });
  });
});

describe("setColumnRem", () => {
  it("narrows as sets increase", () => {
    expect(setColumnRem(3)).toBeGreaterThan(setColumnRem(6));
    expect(setColumnRem(6)).toBeGreaterThan(setColumnRem(8));
  });
});

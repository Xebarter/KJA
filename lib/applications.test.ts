import { describe, expect, it } from "vitest";
import { initials } from "@/lib/applications";

describe("initials", () => {
  it("returns a placeholder when the name is missing", () => {
    expect(initials(undefined)).toBe("?");
    expect(initials(null)).toBe("?");
  });

  it("keeps generating initials from a name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
  });
});

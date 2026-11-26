import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { studentSearchFilter, studentsQuery, type StudentFilters } from "./students";

const baseFilters: StudentFilters = {
  q: "",
  status: "active",
  section: "",
  class: "",
  stream: "",
  campus: "",
  house: "",
  sex: "",
  staff: false,
  medical: false,
  review: false,
  sort: "class",
  size: 50,
  page: 1,
};

describe("Admissions student register queries", () => {
  it("searches family names and home areas as well as student and guardian details", () => {
    const filter = studentSearchFilter("Mirembe");

    expect(filter).toContain("mailing_name.ilike.%mirembe%");
    expect(filter).toContain("home_area.ilike.%mirembe%");
    expect(filter).toContain("father_name.ilike.%mirembe%");
    expect(filter).toContain("mother_name.ilike.%mirembe%");
  });

  it("adds a stable student-id tie-breaker to every sort mode", () => {
    const sortModes: StudentFilters["sort"][] = ["class", "name", "number", "newest", "age"];

    for (const sort of sortModes) {
      const orders: string[] = [];
      const builder = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        is() { return this; },
        not() { return this; },
        or() { return this; },
        order(column: string) {
          orders.push(column);
          return this;
        },
      };
      const client = { from: () => builder } as unknown as SupabaseClient;

      studentsQuery(client, { ...baseFilters, sort });

      expect(orders.at(-1)).toBe("id");
    }
  });
});

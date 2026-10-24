import { describe, expect, it } from "vitest";
import {
  destinationForGrants,
  grantsFromForm,
  isFullAdmin,
  legacyGrants,
  pageIdForPath,
  pathAllowed,
  roleForGrants,
} from "@/lib/dashboard-access";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("dashboard access", () => {
  it("treats administrator as every dashboard", () => {
    const full = grantsFromForm(form([["full", "1"]]));
    expect(full.grants && isFullAdmin(full.grants)).toBe(true);
    expect(roleForGrants(full.grants || [])).toBe("admin");
  });

  it("keeps a single office on its own role and several offices as officer", () => {
    const invoices = grantsFromForm(form([["grant", "accounts:invoices"]]));
    expect(roleForGrants(invoices.grants || [])).toBe("accounts");
    const both = grantsFromForm(form([["grant", "accounts:invoices"], ["grant", "admissions:visits"]]));
    expect(roleForGrants(both.grants || [])).toBe("officer");
  });

  it("allows only the granted page, and keeps Team for a full admin", () => {
    const grants = grantsFromForm(form([["grant", "accounts:invoices"], ["grant", "admissions:visits"]])).grants || [];
    expect(pathAllowed(grants, "accounts", "/accounts/invoices/abc")).toBe(true);
    expect(pathAllowed(grants, "accounts", "/accounts/expenses")).toBe(false);
    expect(pathAllowed(grants, "admin", "/admin/team")).toBe(false);
    expect(pathAllowed(legacyGrants("admin"), "admin", "/admin/team")).toBe(true);
  });

  it("maps nested routes onto the page that owns them", () => {
    expect(pageIdForPath("accounts", "/accounts/families/1")).toBe("students");
    expect(pageIdForPath("academics", "/academics_office/students/1")).toBe("classes");
    expect(pageIdForPath("admin", "/admin")).toBe("overview");
    expect(pageIdForPath("admin", "/admin/applications")).toBe("applications");
  });

  it("opens one dashboard directly and asks when there are several", () => {
    const one = legacyGrants("accounts");
    expect(destinationForGrants(one, "/accounts/expenses")).toBe("/accounts/expenses");
    expect(destinationForGrants(one, "/admin")).toBe("/accounts");
    const full = grantsFromForm(form([["full", "1"]])).grants || [];
    expect(destinationForGrants(full, null)).toBe("/choose-dashboard");
    expect(destinationForGrants(full, "/admin/stories")).toBe("/admin/stories");
    const both = grantsFromForm(form([["grant", "accounts:*"], ["grant", "admissions:*"]])).grants || [];
    expect(destinationForGrants(both, null)).toBe("/choose-dashboard");
  });

  it("asks for a page when nothing is chosen", () => {
    expect(grantsFromForm(form([])).error).toBeTruthy();
  });
});

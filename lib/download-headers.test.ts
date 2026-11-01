import { describe, expect, it } from "vitest";
import { contentDisposition } from "@/lib/download-headers";

describe("contentDisposition", () => {
  it("keeps ASCII filenames intact", () => {
    expect(contentDisposition("KJA marks - Mid Term - P.1 A.xlsx")).toBe(
      'attachment; filename="KJA marks - Mid Term - P.1 A.xlsx"; filename*=UTF-8\'\'KJA%20marks%20-%20Mid%20Term%20-%20P.1%20A.xlsx',
    );
  });

  it("strips non-ASCII from filename= so Undici will accept the header", () => {
    const header = contentDisposition("KJA marks – Mid‑Term — P.1 A.xlsx");
    const ascii = header.match(/filename="([^"]*)"/)?.[1] || "";
    expect([...ascii].every((ch) => ch.charCodeAt(0) <= 0x7e)).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent("KJA marks – Mid‑Term — P.1 A.xlsx"));
  });
});

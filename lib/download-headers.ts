/**
 * Build a Content-Disposition value safe for Node/Undici response headers.
 * Undici requires header values to be ByteStrings (code points ≤ 255). Putting
 * raw Unicode in filename="…" throws after the route returns and surfaces as a
 * Next.js HTML 500 — common with assessment names that include en-dashes, smart
 * quotes, or non-Latin letters. Keep an ASCII fallback in filename= and the real
 * name in RFC 5987 filename*.
 */
export function contentDisposition(filename: string, kind: "attachment" | "inline" = "attachment") {
  const safe = filename
    .replace(/["\r\n]/g, "")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/_+/g, "_")
    .trim() || "download";
  return `${kind}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

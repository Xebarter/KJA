const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", hellip: "\u2026",
  ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
};

export function decodeEntities(text?: string | null) {
  if (!text) return "";
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== "#") return NAMED_ENTITIES[code.toLowerCase()] ?? match;
    const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : match;
  });
}

const OLD_HOSTS = /https?:\/\/(?:84\.247\.190\.131|(?:www\.)?kja\.ug)/g;

export function localizeHtml(html?: string | null) {
  if (!html) return "";
  return html
    .replace(OLD_HOSTS, (host) => (host.startsWith("http://84.") ? "https://kja.ug" : host))
    .replace(/href="https:\/\/(?:www\.)?kja\.ug\/(?!wp-content\/)([^"#?]*?)\/?([#?][^"]*)?"/g, (_, path: string, rest = "") => `href="/${path}${rest}"`);
}

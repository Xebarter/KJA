import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const chunks = html.split('<div class="event-item');
const out = [];
for (const chunk of chunks.slice(1)) {
  const loc = chunk.match(/fa-map-marker-alt[\s\S]*?<\/i>(?:<span>&nbsp;&nbsp;&nbsp;<\/span>)?\s*([^<]+)/);
  const date = chunk.match(/fa-calendar-alt[\s\S]*?<\/i>\s*([^<]+)/);
  const time = chunk.match(/fa-clock[\s\S]*?<\/i>\s*([^<]+)/);
  const href = chunk.match(/href="https:\/\/kja\.ug\/event\/([^/"]+)/);
  const title = chunk.match(/event-title[\s\S]*?<a[^>]*>([^<]+)/);
  if (!href) continue;
  out.push({
    slug: href[1],
    title: (title?.[1] || "").replace(/&amp;/g, "&").trim(),
    location: (loc?.[1] || "").replace(/\u00a0/g, " ").trim(),
    date: (date?.[1] || "").trim(),
    time: (time?.[1] || "").trim(),
  });
}
writeFileSync("data/event-dates.json", JSON.stringify(out, null, 2));
console.log(out.length, out[0]);

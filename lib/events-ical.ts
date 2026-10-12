import { createHash } from "node:crypto";
import { addDays, type CalEvent } from "./events-calendar";

const SITE = "https://kja.ug";
const TZID = "Africa/Nairobi";

function escapeText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function compactDate(ymd: string) {
  return ymd.replace(/-/g, "");
}

function wallDateTime(wall: number) {
  return new Date(wall).toISOString().replace(/[-:]/g, "").slice(0, 15);
}

/* Publish dates without an explicit offset are Kampala wall-clock times (UTC+3). */
function utcStamp(value: string | null) {
  const hasZone = value && /(z|[+-]\d{2}:?\d{2})$/i.test(value);
  const ms = value ? (hasZone ? Date.parse(value) : Date.parse(`${value}Z`) - 3 * 3_600_000) : Number.NaN;
  return `${new Date(Number.isNaN(ms) ? Date.now() : ms).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

function imageType(url: string) {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  return `image/${ext || "jpeg"}`;
}

function vevent(event: CalEvent) {
  const stamp = utcStamp(event.published);
  const lines = event.allDay
    ? [`DTSTART;VALUE=DATE:${compactDate(event.startDate)}`, `DTEND;VALUE=DATE:${compactDate(addDays(event.endDate, 1))}`]
    : [`DTSTART;TZID=${TZID}:${wallDateTime(event.start)}`, `DTEND;TZID=${TZID}:${wallDateTime(event.end)}`];
  lines.push(
    `DTSTAMP:${stamp}`,
    `CREATED:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `UID:${event.id}-${Math.floor(event.start / 1000)}-${Math.floor(event.end / 1000)}@kja.ug`,
    `SUMMARY:${escapeText(event.plainTitle)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `URL:${SITE}${event.href}/`,
  );
  if (event.image) lines.push(`ATTACH;FMTTYPE=${imageType(event.image)}:${event.image}`);
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

export function buildIcal(events: CalEvent[], { outlook = false } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kampala Junior Academy - ECPv6.16.5.1//NONSGML v1.0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(outlook ? [] : ["X-WR-CALNAME:Kampala Junior Academy"]),
    `X-ORIGINAL-URL:${SITE}`,
    "X-WR-CALDESC:Events for Kampala Junior Academy",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-Robots-Tag:noindex",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:EAT",
    "DTSTART:20250101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events.flatMap(vevent),
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function icalResponse(events: CalEvent[], requestUrl: string, outlook: boolean) {
  const hash = createHash("md5").update(requestUrl).digest("hex").slice(0, 11);
  return new Response(buildIcal(events, { outlook }), {
    headers: {
      "Content-Type": "text/calendar; charset=UTF-8",
      "Content-Disposition": `attachment; filename="kampala-junior-academy-${hash}.ics"`,
    },
  });
}

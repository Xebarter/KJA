import { dayStart, formatTime, MONTHS, parseYmd, WEEKDAYS, type CalEvent, type Clock } from "./events-calendar";
import { decodeEntities } from "./html";

const SITE_URL = "https://kja.ug";
const TIMEZONE = "Africa/Nairobi";
const GCAL_DETAILS_LIMIT = 996;
const MORE_LIMIT = 3;

export type EventStatus = "upcoming" | "today" | "live" | "past";

export type EventSingle = {
  event: CalEvent;
  prev: CalEvent | null;
  next: CalEvent | null;
  status: EventStatus;
  statusLabel: string;
  countdown: string;
  dateLabel: string;
  timeLabel: string;
  body: string;
  more: CalEvent[];
  links: { key: string; label: string; href: string; icon: string }[];
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function wallParts(wall: number) {
  const date = new Date(wall);
  return {
    ymd: `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    iso: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    his: `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`,
  };
}

function hex(char: string) {
  return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
}

/* PHP rawurlencode / urlencode, which also escape the characters encodeURIComponent leaves alone. */
function rawUrlencode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, hex);
}

function urlencode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*~]/g, hex).replace(/%20/g, "+");
}

/* get_the_title() output: texturized characters and ampersands become numeric entities. */
function htmlTitle(title: string) {
  return title.replace(/&/g, "&#038;").replace(/[^\x00-\x7f]/g, (char) => `&#${char.codePointAt(0)};`);
}

function plainContent(html: string) {
  return decodeEntities(html.replace(/<\/p>/g, "</p> ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function eventUrl(event: CalEvent) {
  return `${SITE_URL}/event/${event.slug}/`;
}

function googleLink(event: CalEvent, details: string) {
  const start = wallParts(event.start);
  const end = wallParts(event.end);
  let text = details;
  if (text.length > GCAL_DETAILS_LIMIT) text = `${text.slice(0, GCAL_DETAILS_LIMIT)} (View Full Event Description Here: ${eventUrl(event)})`;
  return (
    "https://www.google.com/calendar/event?action=TEMPLATE" +
    `&dates=${start.ymd}T${start.his}/${end.ymd}T${end.his}` +
    `&text=${rawUrlencode(htmlTitle(event.title))}` +
    `&details=${urlencode(text)}` +
    `&trp=false&ctz=${TIMEZONE}&sprop=website:${SITE_URL}`
  );
}

function outlookLink(base: string, event: CalEvent, details: string) {
  const start = wallParts(event.start);
  const end = wallParts(event.end);
  const startdt = `${start.iso}T${start.time}+03:00`;
  const enddt = event.allDay ? `${end.iso}T00:00:00` : `${end.iso}T${end.time}+03:00`;
  return (
    `${base}?path=/calendar/action/compose&rrv=addevent` +
    `&startdt=${rawUrlencode(startdt)}&enddt=${rawUrlencode(enddt)}&location` +
    `&subject=${rawUrlencode(event.plainTitle)}&body=${rawUrlencode(details)}`
  );
}

const STATUS_LABELS: Record<EventStatus, string> = { upcoming: "Upcoming", today: "Today", live: "Happening now", past: "Past event" };

function longDate(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  return `${WEEKDAYS[new Date(dayStart(ymd)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

export function dateRangeLabel(start: string, end: string) {
  if (start === end) return longDate(start);
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (a.y !== b.y) return `${MONTHS[a.m - 1]} ${a.d}, ${a.y} – ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
  if (a.m !== b.m) return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}, ${a.y}`;
  return `${MONTHS[a.m - 1]} ${a.d} – ${b.d}, ${a.y}`;
}

export function timeRangeLabel(event: CalEvent) {
  if (event.allDay) return "All day";
  const start = formatTime(event.startMinutes);
  const end = formatTime(event.endMinutes);
  return start === end ? start : `${start} – ${end}`;
}

function statusOf(event: CalEvent, clock: Clock): EventStatus {
  if (event.end < clock.now) return "past";
  if (event.start <= clock.now) return "live";
  return event.startDate === clock.today ? "today" : "upcoming";
}

function countdownOf(event: CalEvent, status: EventStatus, clock: Clock) {
  if (status !== "upcoming") return "";
  const days = Math.round((dayStart(event.startDate) - dayStart(clock.today)) / 86_400_000);
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

/* Imported event bodies often carry nothing but block-editor leftovers: a post-date block, spacers and empty paragraphs. */
function cleanBody(html: string) {
  const cleaned = html
    .replace(/<div class="wp-block-post-date">[\s\S]*?<\/div>/g, "")
    .replace(/<div[^>]*class="wp-block-spacer"[^>]*><\/div>/g, "")
    .replace(/<p[^>]*>\s*(?:&nbsp;)?\s*<\/p>/g, "")
    .trim();
  return plainContent(cleaned) ? cleaned : "";
}

/* Soonest upcoming events first, topped up with the most recent past ones. */
function moreEvents(all: CalEvent[], event: CalEvent, clock: Clock) {
  const others = all.filter((each) => each.slug !== event.slug);
  const upcoming = others.filter((each) => each.end >= clock.now);
  const past = others.filter((each) => each.end < clock.now).reverse();
  return [...upcoming, ...past].slice(0, MORE_LIMIT);
}

export function buildEventSingle(all: CalEvent[], slug: string, body: string, clock: Clock): EventSingle | null {
  const index = all.findIndex((event) => event.slug === slug);
  if (index < 0) return null;
  const event = all[index];
  const details = plainContent(body);
  const status = statusOf(event, clock);
  return {
    event,
    prev: all[index - 1] ?? null,
    next: all[index + 1] ?? null,
    status,
    statusLabel: STATUS_LABELS[status],
    countdown: countdownOf(event, status, clock),
    dateLabel: dateRangeLabel(event.startDate, event.endDate),
    timeLabel: timeRangeLabel(event),
    body: cleanBody(body),
    more: moreEvents(all, event, clock),
    links: [
      { key: "gcal", label: "Google Calendar", href: googleLink(event, details), icon: "fab fa-google" },
      { key: "ical", label: "Apple Calendar", href: `webcal://kja.ug/event/${event.slug}/?ical=1`, icon: "fab fa-apple" },
      { key: "outlook-365", label: "Outlook 365", href: outlookLink("https://outlook.office.com/owa/", event, details), icon: "fab fa-microsoft" },
      { key: "outlook-live", label: "Outlook.com", href: outlookLink("https://outlook.live.com/owa/", event, details), icon: "far fa-envelope" },
      { key: "ics", label: "Download .ics", href: `/event/${event.slug}?ical=1`, icon: "fas fa-download" },
    ],
  };
}

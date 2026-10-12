import { formatDateAuto, formatTime, scheduleDetails, type CalEvent, type Clock, type ScheduleParts } from "./events-calendar";
import { decodeEntities } from "./html";

const SITE_URL = "https://kja.ug";
const TIMEZONE = "Africa/Nairobi";
const GCAL_DETAILS_LIMIT = 996;

export type MetaItem = { labelClass: string; label: string; abbrClass: string; title: string; value: string; time?: boolean };

export type EventSingle = {
  event: CalEvent;
  prev: CalEvent | null;
  next: CalEvent | null;
  passed: boolean;
  schedule: ScheduleParts;
  meta: MetaItem[];
  links: { key: string; label: string; href: string }[];
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

/* modules/meta/details.php: Date (+ Time) for single-day events, Start/End for multi-day ones. */
function detailsMeta(event: CalEvent, today: string): MetaItem[] {
  const startDate = formatDateAuto(event.startDate, today);
  const endDate = formatDateAuto(event.endDate, today);
  const multiday = event.startDate !== event.endDate;
  const date = (label: string, value: string, title: string, end = false): MetaItem => ({
    labelClass: `tribe-events-${end ? "end" : "start"}-date-label`,
    label,
    abbrClass: end ? "tribe-events-end-date dtend" : "tribe-events-start-date published dtstart",
    title,
    value,
  });
  if (event.allDay) {
    if (!multiday) return [date("Date:", startDate, event.startDate)];
    return [date("Start:", startDate, event.startDate), date("End:", endDate, event.endDate, true)];
  }
  if (multiday) {
    return [
      date("Start:", `${startDate} @ ${formatTime(event.startMinutes)}`, event.startDate),
      date("End:", `${endDate} @ ${formatTime(event.endMinutes)}`, event.endDate, true),
    ];
  }
  const start = formatTime(event.startMinutes);
  const end = formatTime(event.endMinutes);
  return [
    date("Date:", startDate, event.startDate),
    {
      labelClass: "tribe-events-start-time-label",
      label: "Time:",
      abbrClass: "tribe-events-start-time published dtstart",
      title: event.endDate,
      value: start === end ? start : `${start} - ${end}`,
      time: true,
    },
  ];
}

export function buildEventSingle(all: CalEvent[], slug: string, body: string, clock: Clock): EventSingle | null {
  const index = all.findIndex((event) => event.slug === slug);
  if (index < 0) return null;
  const event = all[index];
  const details = plainContent(body);
  return {
    event,
    prev: all[index - 1] ?? null,
    next: all[index + 1] ?? null,
    passed: event.end < clock.now,
    schedule: scheduleDetails(event, clock.today),
    meta: detailsMeta(event, clock.today),
    links: [
      { key: "gcal", label: "Google Calendar", href: googleLink(event, details) },
      { key: "ical", label: "iCalendar", href: `webcal://kja.ug/event/${event.slug}/?ical=1` },
      { key: "outlook-365", label: "Outlook 365", href: outlookLink("https://outlook.office.com/owa/", event, details) },
      { key: "outlook-live", label: "Outlook Live", href: outlookLink("https://outlook.live.com/owa/", event, details) },
    ],
  };
}

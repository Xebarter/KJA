import { decodeEntities } from "./html";
import type { Article } from "./types";

export const EVENTS_PER_PAGE = 12;
export const LATEST_PAST_PER_PAGE = 3;
export const MONTH_EVENTS_PER_DAY = 3;

const DAY_MS = 86_400_000;
// Africa/Kampala is UTC+3 all year, so wall-clock times are stored as UTC epochs shifted by this offset.
const KAMPALA_OFFSET_MS = 3 * 3_600_000;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_SHORT = MONTHS.map((month) => month.slice(0, 3));
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_SHORT = WEEKDAYS.map((day) => day.slice(0, 3));

export type CalEvent = {
  id: string;
  slug: string;
  title: string;
  plainTitle: string;
  href: string;
  description: string;
  published: string | null;
  image: string | null;
  imageTitle: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startMinutes: number;
  endMinutes: number;
  start: number;
  end: number;
};

export type Clock = { now: number; today: string };

export function kampalaClock(): Clock {
  const now = Date.now() + KAMPALA_OFFSET_MS;
  return { now, today: ymdOf(now) };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function ymdOf(wall: number) {
  const date = new Date(wall);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

export function isYmd(value?: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { y, m, d } = parseYmd(value);
  return ymdOf(Date.UTC(y, m - 1, d)) === value;
}

export function dayStart(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  return Date.UTC(y, m - 1, d);
}

export function dayEnd(ymd: string) {
  return dayStart(ymd) + DAY_MS - 1;
}

export function addDays(ymd: string, days: number) {
  return ymdOf(dayStart(ymd) + days * DAY_MS);
}

export function weekday(ymd: string) {
  return new Date(dayStart(ymd)).getUTCDay();
}

export function formatDate(ymd: string, withYear: boolean) {
  const { y, m, d } = parseYmd(ymd);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}

export function formatDateAuto(ymd: string, today: string) {
  return formatDate(ymd, ymd.slice(0, 4) !== today.slice(0, 4));
}

export function formatCompact(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  return `${m}/${d}/${y}`;
}

export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "am" : "pm"}`;
}

export function formatHm(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function parseTime(value?: string | null) {
  const match = value?.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  if (match[3]) hours = (hours % 12) + (match[3] === "pm" ? 12 : 0);
  return hours * 60 + Number(match[2]);
}

function texturize(text: string) {
  return text.replace(/(\w)'(\w)/g, "$1\u2019$2");
}

function plainText(html?: string | null) {
  return decodeEntities((html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function excerptOf(article: Article) {
  const manual = plainText(article.excerpt);
  if (manual) return manual;
  const words = plainText(article.body).split(" ").filter(Boolean);
  if (!words.length) return "";
  return words.length > 55 ? `${words.slice(0, 55).join(" ")} [\u2026]` : words.join(" ");
}

function imageTitle(url: string) {
  const file = url.split("/").pop() || "";
  return file.replace(/\.[a-z0-9]+$/i, "").replace(/-\d+x\d+$/, "").replace(/[-_]+/g, " ").trim();
}

export function toCalEvents(articles: Article[]): CalEvent[] {
  const events: CalEvent[] = [];
  for (const article of articles) {
    if (!isYmd(article.starts_on)) continue;
    const startDate = article.starts_on;
    const endDate = isYmd(article.ends_on) && article.ends_on >= startDate ? article.ends_on : startDate;
    const startTime = parseTime(article.start_time);
    const endTime = parseTime(article.end_time);
    const allDay = startTime === null || (startTime === 0 && endTime === 23 * 60 + 59);
    const startMinutes = allDay ? 0 : startTime;
    const endMinutes = allDay ? 23 * 60 + 59 : Math.max(endTime ?? startTime, endDate === startDate ? startTime : 0);
    const image = article.thumbnail_url || article.image_url || null;
    events.push({
      id: article.id || article.slug,
      slug: article.slug,
      title: texturize(decodeEntities(article.title)),
      plainTitle: decodeEntities(article.title),
      href: `/event/${article.slug}`,
      description: excerptOf(article),
      published: article.published_at || null,
      image,
      imageTitle: image ? imageTitle(image) : "",
      allDay,
      startDate,
      endDate,
      startMinutes,
      endMinutes,
      start: dayStart(startDate) + startMinutes * 60_000,
      end: dayStart(endDate) + endMinutes * 60_000 + (allDay ? 59_999 : 0),
    });
  }
  return events.sort((a, b) => a.start - b.start || a.end - b.end || a.title.localeCompare(b.title));
}

function matchesKeyword(event: CalEvent, keyword: string) {
  if (!keyword) return true;
  const needle = keyword.toLowerCase();
  return event.title.toLowerCase().includes(needle) || event.description.toLowerCase().includes(needle);
}

/* ---------- URLs ---------- */

export type ListQuery = { past?: boolean; page?: number; keyword?: string; date?: string | null };

export function listUrl({ past, page = 1, keyword, date }: ListQuery = {}) {
  const params = new URLSearchParams();
  if (keyword) params.set("tribe-bar-search", keyword);
  if (date) params.set("tribe-bar-date", date);
  if (past) params.set("eventDisplay", "past");
  if (page > 1) params.set("tribe-paged", String(page));
  const query = params.toString();
  return `/events/list${query ? `?${query}` : ""}`;
}

function keywordQuery(keyword: string) {
  return keyword ? `?${new URLSearchParams({ "tribe-bar-search": keyword })}` : "";
}

export function monthUrl(ym: string | null, keyword = "") {
  return `/events/month${ym ? `/${ym}` : ""}${keywordQuery(keyword)}`;
}

export function dayUrl(ymd: string | null, keyword = "") {
  return `/events/${ymd || "today"}${keywordQuery(keyword)}`;
}

/* ---------- Shared view data ---------- */

export type Message = { html: string; icon: boolean; key: string };

export type Datepicker = {
  showNow: boolean;
  nowLabel: string;
  nowLabelMobile: string;
  startDatetime: string;
  startLabel: string;
  startMobile: string;
  showEnd: boolean;
  endDatetime: string;
  endLabel: string;
  endMobile: string;
  inputValue: string;
};

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function upcomingCount(events: CalEvent[], clock: Clock) {
  return events.filter((event) => event.end > clock.now).length;
}

/* ---------- List view ---------- */

export type ListView = {
  kind: "list";
  past: boolean;
  page: number;
  keyword: string;
  barDate: string | null;
  events: CalEvent[];
  latestPast: CalEvent[];
  prevUrl: string;
  nextUrl: string;
  todayUrl: string;
  url: string;
  messages: Message[];
  datepicker: Datepicker;
  pageTitle: string;
};

export function buildListView(all: CalEvent[], clock: Clock, opts: { past: boolean; page: number; keyword: string; barDate: string | null }): ListView {
  const { past, keyword, barDate } = opts;
  const page = Math.max(1, opts.page);
  const pivot = barDate ? dayStart(barDate) : clock.now;
  const matching = all.filter((event) => matchesKeyword(event, keyword));
  const query = { keyword, date: barDate };

  let events: CalEvent[];
  let prevUrl = "";
  let nextUrl = "";
  if (past) {
    const pool = matching.filter((event) => event.end < pivot).reverse();
    events = pool.slice((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE).reverse();
    if (pool.length > page * EVENTS_PER_PAGE) prevUrl = listUrl({ ...query, past: true, page: page + 1 });
    nextUrl = page > 1 ? listUrl({ ...query, past: true, page: page - 1 }) : listUrl(query);
  } else {
    const pool = matching.filter((event) => event.end > pivot);
    events = pool.slice((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE);
    if (page > 1) prevUrl = listUrl({ ...query, page: page - 1 });
    else if (matching.some((event) => event.end < pivot)) prevUrl = listUrl({ ...query, past: true });
    if (pool.length > page * EVENTS_PER_PAGE) nextUrl = listUrl({ ...query, page: page + 1 });
  }

  const showLatestPast = !past && page === 1 && !keyword && !events.length;
  const latestPast = showLatestPast
    ? all.filter((event) => event.end < dayStart(clock.today)).reverse().slice(0, LATEST_PAST_PER_PAGE)
    : [];

  const messages: Message[] = [];
  if (!events.length) {
    if (keyword) {
      messages.push({ key: "0", icon: true, html: `There were no results found for <strong>"${escapeHtml(keyword)}"</strong>.` });
    } else {
      const text = upcomingCount(all, clock) ? "There were no results found." : "There are no upcoming events.";
      messages.push({ key: "0", icon: !latestPast.length, html: text });
    }
  }

  const datepicker = listDatepicker(events, clock, { past, page, barDate, hasNextPage: Boolean(nextUrl) });
  const titleEvents = events.length ? events : latestPast.slice(0, 1);
  let pageTitle = past ? "Past Events" : "Upcoming Events";
  if (titleEvents.length) {
    const first = formatDateAuto(titleEvents[0].startDate, clock.today);
    const last = formatDateAuto(titleEvents[titleEvents.length - 1].startDate, clock.today);
    const range = first === last ? first : `${first} - ${last}`;
    pageTitle = `${past ? "Past Events" : "Events"} from ${range}`;
  }

  return {
    kind: "list",
    past,
    page,
    keyword,
    barDate,
    events,
    latestPast,
    prevUrl,
    nextUrl,
    todayUrl: listUrl({ keyword }),
    url: listUrl({ past, page, keyword, date: barDate }),
    messages,
    datepicker,
    pageTitle,
  };
}

function listDatepicker(events: CalEvent[], clock: Clock, opts: { past: boolean; page: number; barDate: string | null; hasNextPage: boolean }): Datepicker {
  const { past, page, hasNextPage } = opts;
  const userDate = opts.barDate || clock.today;
  let showNow = !past && userDate === clock.today && page <= 1;
  const sorted = [...events].sort((a, b) => a.start - b.start);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  let start: string;
  let end: string;
  if (!past) {
    start = page === 1 ? userDate : first ? first.startDate : userDate;
    end = last ? last.startDate : userDate;
    if (start < userDate) start = userDate;
  } else {
    start = first ? first.startDate : userDate;
    end = last ? last.startDate : userDate;
  }
  if (start > end) end = userDate;
  const firstPastPage = past && page === 1;
  if (firstPastPage) end = userDate;

  const diffDates = new Set(sorted.map((event) => event.startDate)).size > 1;
  const showEnd = firstPastPage || (hasNextPage && diffDates && start !== end);
  const startLabel = formatDateAuto(start, clock.today);
  const startMobile = formatCompact(start);

  let nowLabel = "Now";
  let nowLabelMobile = "Now";
  if (!events.length || !hasNextPage) {
    nowLabel = "Upcoming";
    nowLabelMobile = "Upcoming";
    showNow = true;
  }

  return {
    showNow,
    nowLabel,
    nowLabelMobile,
    startDatetime: start,
    startLabel,
    startMobile,
    showEnd,
    endDatetime: end,
    endLabel: end === clock.today ? "Now" : formatDateAuto(end, clock.today),
    endMobile: formatCompact(end),
    inputValue: formatCompact(start),
  };
}

/* ---------- Month view ---------- */

export type MonthDay = {
  date: string;
  dayNumber: number;
  otherMonth: boolean;
  past: boolean;
  current: boolean;
  pastMonth: boolean;
  nextMonth: boolean;
  allDay: CalEvent[];
  timed: CalEvent[];
  more: number;
  count: number;
};

export type MonthView = {
  kind: "month";
  ym: string;
  keyword: string;
  label: string;
  labelMobile: string;
  weeks: MonthDay[][];
  events: CalEvent[];
  prevUrl: string;
  nextUrl: string;
  prevLabel: string;
  nextLabel: string;
  todayUrl: string;
  url: string;
  isCurrentMonth: boolean;
  messages: Message[];
  inputValue: string;
  pageTitle: string;
};

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function overlapsDay(event: CalEvent, ymd: string) {
  return event.start <= dayEnd(ymd) && event.end >= dayStart(ymd);
}

export function buildMonthView(all: CalEvent[], clock: Clock, opts: { ym: string | null; keyword: string }): MonthView {
  const keyword = opts.keyword;
  const ym = opts.ym || clock.today.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${ym}-${pad(lastDay)}`;
  const gridStart = addDays(first, -((weekday(first) + 6) % 7));
  const gridEnd = addDays(last, (7 - weekday(last)) % 7);
  const matching = all.filter((event) => matchesKeyword(event, keyword));

  const weeks: MonthDay[][] = [];
  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
    if (!weeks.length || weeks[weeks.length - 1].length === 7) weeks.push([]);
    const dayEvents = matching.filter((event) => overlapsDay(event, date));
    const allDay = dayEvents.filter((event) => event.allDay || event.startDate !== event.endDate);
    const timed = dayEvents.filter((event) => !allDay.includes(event));
    const visibleTimed = timed.slice(0, Math.max(0, MONTH_EVENTS_PER_DAY - allDay.length));
    weeks[weeks.length - 1].push({
      date,
      dayNumber: parseYmd(date).d,
      otherMonth: date.slice(0, 7) !== ym,
      past: date < clock.today,
      current: date === clock.today,
      pastMonth: date < first,
      nextMonth: date > last,
      allDay,
      timed: visibleTimed,
      more: timed.length - visibleTimed.length,
      count: dayEvents.length,
    });
  }

  const prevYm = shiftMonth(ym, -1);
  const nextYm = shiftMonth(ym, 1);
  const earliestYm = all.length ? all[0].startDate.slice(0, 7) : prevYm;
  const latestYm = all.length ? all.reduce((max, event) => (event.endDate > max ? event.endDate : max), all[0].endDate).slice(0, 7) : nextYm;
  const nextEventYm = matching.find((event) => event.start > dayEnd(last))?.startDate.slice(0, 7);
  const thisMonth = clock.today.slice(0, 7);
  const monthEvents = matching.filter((event) => event.start <= dayEnd(last) && event.end >= dayStart(first));

  const messages: Message[] = [];
  if (!monthEvents.length) {
    if (keyword) {
      messages.push({ key: "0", icon: true, html: `There were no results found for <strong>"${escapeHtml(keyword)}"</strong> this month.` });
    } else if (nextEventYm) {
      messages.push({
        key: "0",
        icon: true,
        html: `There were no results found for this view. Jump to the <a href="${monthUrl(nextEventYm)}" class="tribe-events-c-messages__message-list-item-link tribe-common-anchor-thin-alt" data-js="tribe-events-view-link">next upcoming events</a>.`,
      });
    } else {
      messages.push({ key: "0", icon: true, html: upcomingCount(all, clock) ? "There were no results found for this view." : "There are no upcoming events." });
    }
  }

  return {
    kind: "month",
    ym,
    keyword,
    label: `${MONTHS[m - 1]} ${y}`,
    labelMobile: `${m}/${y}`,
    weeks,
    events: monthEvents,
    prevUrl: prevYm >= earliestYm ? monthUrl(prevYm, keyword) : "",
    nextUrl: nextYm <= latestYm ? monthUrl(nextYm, keyword) : "",
    prevLabel: MONTHS_SHORT[Number(prevYm.slice(5)) - 1],
    nextLabel: MONTHS_SHORT[Number(nextYm.slice(5)) - 1],
    todayUrl: monthUrl(null, keyword),
    url: monthUrl(ym === thisMonth ? null : ym, keyword),
    isCurrentMonth: ym === thisMonth,
    messages,
    inputValue: formatCompact(ym === thisMonth ? clock.today : first),
    pageTitle: `Events for ${MONTHS[m - 1]} ${y}`,
  };
}

/* ---------- Day view ---------- */

export type DayView = {
  kind: "day";
  date: string;
  keyword: string;
  allDay: CalEvent[];
  ongoing: CalEvent[];
  timed: CalEvent[];
  prevUrl: string;
  nextUrl: string;
  todayUrl: string;
  url: string;
  feedDate: string | null;
  messages: Message[];
  label: string;
  labelMobile: string;
  pageTitle: string;
};

export function buildDayView(all: CalEvent[], clock: Clock, opts: { date: string | null; keyword: string }): DayView {
  const keyword = opts.keyword;
  const date = opts.date || clock.today;
  const matching = all.filter((event) => matchesKeyword(event, keyword));
  const dayEvents = matching.filter((event) => overlapsDay(event, date));
  const allDay = dayEvents.filter((event) => event.allDay && event.startDate === event.endDate);
  const ongoing = dayEvents.filter((event) => event.startDate !== event.endDate);
  const timed = dayEvents.filter((event) => !event.allDay && event.startDate === event.endDate);
  const earliest = all.length ? all[0].startDate : date;
  const latest = all.length ? all.reduce((max, event) => (event.endDate > max ? event.endDate : max), all[0].endDate) : date;
  const prev = addDays(date, -1);
  const next = addDays(date, 1);

  const messages: Message[] = [];
  if (!dayEvents.length) {
    const label = formatDate(date, true);
    const nextEvent = matching.find((event) => event.start > dayEnd(date));
    if (keyword) {
      messages.push({ key: "0", icon: true, html: `There were no results found for <strong>"${escapeHtml(keyword)}"</strong>.` });
    } else if (nextEvent) {
      messages.push({
        key: "0",
        icon: true,
        html: `No events scheduled for ${label}. Jump to the <a href="${dayUrl(nextEvent.startDate)}" class="tribe-events-c-messages__message-list-item-link tribe-common-anchor-thin-alt" data-js="tribe-events-view-link">next upcoming events</a>.`,
      });
    } else {
      messages.push({ key: "0", icon: true, html: upcomingCount(all, clock) ? `No events scheduled for ${label}.` : "There are no upcoming events." });
    }
  }

  return {
    kind: "day",
    date,
    keyword,
    allDay,
    ongoing,
    timed,
    prevUrl: prev >= earliest ? dayUrl(prev, keyword) : "",
    nextUrl: next <= latest ? dayUrl(next, keyword) : "",
    todayUrl: dayUrl(null, keyword),
    url: dayUrl(date === clock.today ? null : date, keyword),
    feedDate: opts.date,
    messages,
    label: formatDate(date, true),
    labelMobile: formatCompact(date),
    pageTitle: `Events for ${formatDate(date, true)}`,
  };
}

/* ---------- Event schedule ---------- */

export type ScheduleParts = { start: string; separator?: string; endClass?: string; end?: string };

export function scheduleDetails(event: CalEvent, today: string): ScheduleParts {
  const startDate = formatDateAuto(event.startDate, today);
  const endDate = formatDateAuto(event.endDate, today);
  if (event.allDay) {
    if (event.startDate === event.endDate) return { start: startDate };
    return { start: startDate, separator: " - ", endClass: "tribe-event-date-end", end: endDate };
  }
  const startText = `${startDate} @ ${formatTime(event.startMinutes)}`;
  if (event.startDate !== event.endDate) {
    return { start: startText, separator: " - ", endClass: "tribe-event-date-end", end: `${endDate} @ ${formatTime(event.endMinutes)}` };
  }
  if (event.startMinutes === event.endMinutes) return { start: startText };
  return { start: startText, separator: " - ", endClass: "tribe-event-time", end: formatTime(event.endMinutes) };
}

export function roundToHalfHour(minutes: number) {
  return Math.round(minutes / 30) * 30;
}

/* ---------- Routing ---------- */

export type CalendarQuery = Record<string, string | string[] | undefined>;

function queryValue(query: CalendarQuery, key: string) {
  const value = query[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() || "";
}

/* Maps /events/{list|month[/YYYY-MM]|today|YYYY-MM-DD} plus the tribe-bar query vars to a view; null means 404. */
export function resolveCalendarView(segments: string[], query: CalendarQuery, all: CalEvent[], clock: Clock) {
  const keyword = queryValue(query, "tribe-bar-search");
  const barDateValue = queryValue(query, "tribe-bar-date");
  const barDate = isYmd(barDateValue) ? barDateValue : null;
  const [first, second, ...rest] = segments;
  if (rest.length) return null;

  if (!first || first === "list") {
    if (second) return null;
    const page = Number.parseInt(queryValue(query, "tribe-paged"), 10);
    return buildListView(all, clock, {
      past: queryValue(query, "eventDisplay") === "past",
      page: Number.isFinite(page) && page > 0 ? page : 1,
      keyword,
      barDate,
    });
  }
  if (first === "month") {
    if (second && !/^\d{4}-(0[1-9]|1[0-2])$/.test(second)) return null;
    return buildMonthView(all, clock, { ym: second || barDate?.slice(0, 7) || null, keyword });
  }
  if (first === "today" || isYmd(first)) {
    if (second) return null;
    return buildDayView(all, clock, { date: first === "today" ? barDate : first, keyword });
  }
  return null;
}

export function viewEvents(view: ListView | MonthView | DayView) {
  if (view.kind === "month") return view.events;
  if (view.kind === "day") return [...view.allDay, ...view.ongoing, ...view.timed];
  return view.events;
}

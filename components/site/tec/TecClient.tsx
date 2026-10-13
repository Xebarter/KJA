"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { dayUrl, listUrl, MONTHS, MONTHS_SHORT, monthUrl, parseYmd } from "@/lib/events-calendar";

const BREAKPOINTS = { xsmall: 500, medium: 768, full: 960 };
const TOOLTIP_DELAY = 300;

let scrollAfterNavigation = false;

export function setBreakpointClasses(container: HTMLElement) {
  const width = container.offsetWidth;
  for (const [name, min] of Object.entries(BREAKPOINTS)) {
    container.classList.toggle(`tribe-common--breakpoint-${name}`, width >= min);
  }
}

function openAccordion(trigger: Element, content: HTMLElement) {
  trigger.setAttribute("aria-expanded", "true");
  content.setAttribute("aria-hidden", "false");
  content.style.display = "block";
}

function closeAccordion(trigger: Element, content: HTMLElement) {
  trigger.setAttribute("aria-expanded", "false");
  content.setAttribute("aria-hidden", "true");
  content.style.display = "";
}

type Accordion = {
  update: (isMobile: boolean) => void;
  close: () => void;
  contains: (target: Node) => boolean;
  destroy: () => void;
};

/* An accordion that is only active while the view is narrower than the medium breakpoint (search box, view selector). */
function mobileAccordion(container: HTMLElement, buttonSelector: string, contentSelector: string, activeClass: string): Accordion {
  const button = container.querySelector<HTMLElement>(buttonSelector);
  const content = container.querySelector<HTMLElement>(contentSelector);
  if (!button || !content) return { update: () => {}, close: () => {}, contains: () => false, destroy: () => {} };
  let mode: "mobile" | "desktop" | null = null;

  const onClick = (event: MouseEvent) => {
    if (mode !== "mobile") return;
    event.preventDefault();
    event.stopPropagation();
    if (button.getAttribute("aria-expanded") === "true") closeAccordion(button, content);
    else openAccordion(button, content);
    button.classList.toggle(activeClass);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (mode !== "mobile" || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    button.click();
  };
  button.addEventListener("click", onClick);
  button.addEventListener("keydown", onKeyDown);

  return {
    update(isMobile: boolean) {
      if (isMobile && mode !== "mobile") {
        mode = "mobile";
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", content.id);
        content.setAttribute("aria-hidden", "true");
      } else if (!isMobile && mode !== "desktop") {
        mode = "desktop";
        button.removeAttribute("aria-expanded");
        button.removeAttribute("aria-controls");
        button.classList.remove(activeClass);
        content.removeAttribute("aria-hidden");
        content.style.display = "";
      }
    },
    close() {
      if (!button.classList.contains(activeClass)) return;
      button.classList.remove(activeClass);
      closeAccordion(button, content);
    },
    contains(target: Node) {
      return button.contains(target) || content.contains(target);
    },
    destroy() {
      button.removeEventListener("click", onClick);
      button.removeEventListener("keydown", onKeyDown);
    },
  };
}

function setupMonthMobile(container: HTMLElement) {
  const grid = container.querySelector('[data-js="tribe-events-month-grid"]');
  const mobileEvents = container.querySelector('[data-js="tribe-events-calendar-month-mobile-events"]');
  if (!grid || !mobileEvents) return { resize: () => {}, destroy: () => {} };
  const days = Array.from(grid.querySelectorAll<HTMLElement>('[data-js="tribe-events-calendar-month-day-cell-mobile"]'));
  const panelFor = (day: HTMLElement) => {
    const id = day.getAttribute("aria-controls");
    return id ? container.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
  };
  const toggleDefaultNotices = (show: boolean) => {
    const anyShown = container.querySelector(".tribe-events-calendar-month-mobile-events__mobile-day--show");
    container
      .querySelectorAll(".tribe-events-header__messages--mobile:not(.tribe-events-header__messages--day)")
      .forEach((notice) => notice.classList.toggle("tribe-common-a11y-hidden", !(show && !anyShown)));
  };
  const closeDay = (day: HTMLElement) => {
    const panel = panelFor(day);
    if (panel) closeAccordion(day, panel);
    day.classList.remove("tribe-events-calendar-month__day-cell--selected");
    panel?.classList.remove("tribe-events-calendar-month-mobile-events__mobile-day--show");
  };
  const openDay = (day: HTMLElement) => {
    const panel = panelFor(day);
    if (!panel) return;
    openAccordion(day, panel);
    day.classList.add("tribe-events-calendar-month__day-cell--selected");
    panel.classList.add("tribe-events-calendar-month-mobile-events__mobile-day--show");
    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
    requestAnimationFrame(() => {
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const handlers = days.map((day) => {
    const handler = () => {
      if (day.classList.contains("tribe-events-calendar-month__day-cell--selected")) {
        closeDay(day);
        toggleDefaultNotices(true);
      } else {
        days.forEach(closeDay);
        toggleDefaultNotices(false);
        openDay(day);
      }
    };
    day.addEventListener("click", handler);
    return () => day.removeEventListener("click", handler);
  });
  toggleDefaultNotices(true);
  let desktopInitialized = container.offsetWidth >= BREAKPOINTS.medium;
  return {
    resize(isMobile: boolean) {
      if (isMobile) {
        toggleDefaultNotices(true);
        desktopInitialized = false;
      } else if (!desktopInitialized) {
        days.forEach(closeDay);
        desktopInitialized = true;
      }
    },
    destroy() {
      handlers.forEach((remove) => remove());
    },
  };
}

function setupMultiday(container: HTMLElement) {
  const cleanups: (() => void)[] = [];
  container.querySelectorAll<HTMLElement>(".tribe-events-calendar-month__multiday-event-hidden").forEach((hidden) => {
    const id = hidden.closest<HTMLElement>(".tribe-events-calendar-month__multiday-event")?.dataset.eventId;
    if (!id) return;
    const bars = Array.from(container.querySelectorAll<HTMLElement>(`.tribe-events-calendar-month__multiday-event[data-event-id="${CSS.escape(id)}"] .tribe-events-calendar-month__multiday-event-bar-inner`));
    const toggle = (cls: string) => () => bars.forEach((bar) => bar.classList.toggle(cls));
    const hover = toggle("tribe-events-calendar-month__multiday-event-bar-inner--hover");
    const focus = toggle("tribe-events-calendar-month__multiday-event-bar-inner--focus");
    hidden.addEventListener("mouseenter", hover);
    hidden.addEventListener("mouseleave", hover);
    hidden.addEventListener("focusin", focus);
    hidden.addEventListener("focusout", focus);
    cleanups.push(() => {
      hidden.removeEventListener("mouseenter", hover);
      hidden.removeEventListener("mouseleave", hover);
      hidden.removeEventListener("focusin", focus);
      hidden.removeEventListener("focusout", focus);
    });
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}

/* Tooltips modelled on the Tooltipster "sidetip" markup the plugin uses for month view events. */
function setupTooltips(container: HTMLElement) {
  const cleanups: (() => void)[] = [];
  let counter = 0;
  container.querySelectorAll<HTMLElement>('[data-js~="tribe-events-tooltip"]').forEach((origin) => {
    const selector = origin.getAttribute("data-tooltip-content");
    const source = selector ? container.querySelector<HTMLElement>(selector) : null;
    if (!source) return;
    let tip: HTMLDivElement | null = null;
    let openTimer = 0;
    let closeTimer = 0;
    let originHover = false;
    let tipHover = false;

    const place = () => {
      if (!tip) return;
      const rect = origin.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const above = rect.top - tipRect.height >= 0;
      tip.classList.toggle("tooltipster-top", above);
      tip.classList.toggle("tooltipster-bottom", !above);
      const viewport = document.documentElement.clientWidth;
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(0, Math.min(left, viewport - tipRect.width));
      const top = above ? rect.top - tipRect.height : rect.bottom;
      tip.style.left = `${Math.round(left + scrollX)}px`;
      tip.style.top = `${Math.round(top + scrollY)}px`;
      const arrow = tip.querySelector<HTMLElement>(".tooltipster-arrow");
      if (arrow) arrow.style.left = `${Math.round(rect.left + rect.width / 2 - left)}px`;
    };
    const open = () => {
      if (tip) return;
      counter += 1;
      tip = document.createElement("div");
      tip.className = "tooltipster-base tooltipster-sidetip tooltipster-top tooltipster-fade tooltipster-show tribe-events-tooltip-theme tribe-common tribe-events";
      tip.id = `tooltipster-${Date.now()}${counter}`;
      tip.style.cssText = "pointer-events: auto; z-index: 9999999; animation-duration: 0ms; transition-duration: 0ms;";
      tip.innerHTML =
        '<div class="tooltipster-box"><div class="tooltipster-content"></div></div>' +
        '<div class="tooltipster-arrow"><div class="tooltipster-arrow-uncropped"><div class="tooltipster-arrow-border"></div><div class="tooltipster-arrow-background"></div></div></div>';
      tip.querySelector(".tooltipster-content")!.appendChild(source.cloneNode(true));
      tip.addEventListener("mouseenter", () => {
        tipHover = true;
        tip?.classList.add("tribe-events-tooltip-theme--hover");
      });
      tip.addEventListener("mouseleave", () => {
        tipHover = false;
        tip?.classList.remove("tribe-events-tooltip-theme--hover");
        scheduleClose();
      });
      document.body.appendChild(tip);
      place();
    };
    const close = () => {
      if (originHover || tipHover || document.activeElement === origin) return;
      tip?.remove();
      tip = null;
    };
    const scheduleOpen = () => {
      window.clearTimeout(closeTimer);
      openTimer = window.setTimeout(() => {
        if (originHover || document.activeElement === origin) open();
      }, TOOLTIP_DELAY);
    };
    const scheduleClose = () => {
      window.clearTimeout(openTimer);
      closeTimer = window.setTimeout(close, TOOLTIP_DELAY);
    };
    const onEnter = () => {
      originHover = true;
      origin.classList.add("tribe-events-tooltip-trigger--hover");
      scheduleOpen();
    };
    const onLeave = () => {
      originHover = false;
      origin.classList.remove("tribe-events-tooltip-trigger--hover");
      scheduleClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      origin.blur();
      originHover = false;
      tipHover = false;
      close();
    };
    origin.addEventListener("mouseenter", onEnter);
    origin.addEventListener("mouseleave", onLeave);
    origin.addEventListener("focus", scheduleOpen);
    origin.addEventListener("blur", scheduleClose);
    origin.addEventListener("keydown", onKeyDown);
    cleanups.push(() => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      tip?.remove();
      origin.removeEventListener("mouseenter", onEnter);
      origin.removeEventListener("mouseleave", onLeave);
      origin.removeEventListener("focus", scheduleOpen);
      origin.removeEventListener("blur", scheduleClose);
      origin.removeEventListener("keydown", onKeyDown);
    });
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}

/* Mirrors TEC's ical-links.js, including its quirks: the caret class is flipped twice per click (so it reads
   un-rotated while open), and its outside handler is bound to "click, focusin", so only focus moves close it. */
function setupSubscribe(container: HTMLElement) {
  const ROTATE = "tribe-events-c-subscribe-dropdown__button-icon--rotate";
  const buttons = Array.from(container.querySelectorAll<HTMLElement>(".tribe-events-c-subscribe-dropdown__button"));
  const contents = () => Array.from(container.querySelectorAll<HTMLElement>(".tribe-events-c-subscribe-dropdown__content"));
  const icons = () => Array.from(container.querySelectorAll(".tribe-events-c-subscribe-dropdown__button-icon"));
  const reset = () => {
    contents().forEach((content) => (content.style.display = "none"));
    container.querySelectorAll(".tribe-events-c-subscribe-dropdown__button-text").forEach((text) => text.setAttribute("aria-expanded", "false"));
    icons().forEach((icon) => icon.classList.remove(ROTATE));
  };
  const handlers = buttons.map((button) => {
    const handler = (event: MouseEvent) => {
      event.stopPropagation();
      const content = button.parentElement?.querySelector<HTMLElement>(".tribe-events-c-subscribe-dropdown__content");
      const text = button.querySelector(".tribe-events-c-subscribe-dropdown__button-text");
      const icon = button.querySelector(".tribe-events-c-subscribe-dropdown__button-icon");
      if (text) {
        const expanded = text.getAttribute("aria-expanded") === "true";
        text.setAttribute("aria-expanded", expanded ? "false" : "true");
        icons().forEach((each) => each.classList.toggle(ROTATE, !expanded));
      }
      contents().forEach((each) => each !== content && (each.style.display = "none"));
      icons().forEach((each) => each !== icon && each.classList.remove(ROTATE));
      icon?.classList.toggle(ROTATE);
      if (content) content.style.display = getComputedStyle(content).display === "none" ? "block" : "none";
    };
    button.addEventListener("click", handler);
    return () => button.removeEventListener("click", handler);
  });
  const outside = (event: Event) => {
    if (!(event.target as Element | null)?.closest?.(".tribe-events-c-subscribe-dropdown")) reset();
  };
  document.addEventListener("focusin", outside);
  return () => {
    handlers.forEach((remove) => remove());
    document.removeEventListener("focusin", outside);
  };
}

function setupSearchInput(container: HTMLElement) {
  const wrapper = container.querySelector<HTMLElement>('[data-js="tribe-events-events-bar-input-control"]');
  const input = wrapper?.querySelector<HTMLInputElement>('[data-js="tribe-events-events-bar-input-control-input"]');
  if (!wrapper || !input) return () => {};
  const focusClass = "tribe-events-c-search__input-control--keyword-focus";
  const sync = () => wrapper.classList.toggle(focusClass, input.value.trim() !== "");
  sync();
  input.addEventListener("change", sync);
  return () => input.removeEventListener("change", sync);
}

export function TecContainer({ kind, children }: { kind: "list" | "month" | "day"; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const navigate = useCallback(
    (href: string) => {
      scrollAfterNavigation = true;
      router.push(href, { scroll: false });
    },
    [router],
  );

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    setBreakpointClasses(container);
    if (scrollAfterNavigation) {
      scrollAfterNavigation = false;
      const top = container.getBoundingClientRect().top + window.scrollY;
      if (0.75 * window.scrollY > top) window.scrollTo({ top });
    }

    const isMobile = () => container.offsetWidth < BREAKPOINTS.medium;
    const search = mobileAccordion(container, '[data-js="tribe-events-search-button"]', '[data-js="tribe-events-search-container"]', "tribe-events-c-events-bar__search-button--active");
    const selector = mobileAccordion(container, '[data-js="tribe-events-view-selector-button"]', '[data-js="tribe-events-view-selector-list-container"]', "tribe-events-c-view-selector__button--active");
    search.update(isMobile());
    selector.update(isMobile());
    const month = kind === "month" ? setupMonthMobile(container) : null;
    const cleanups = [
      kind === "month" ? setupMultiday(container) : () => {},
      kind === "month" ? setupTooltips(container) : () => {},
      setupSubscribe(container),
      setupSearchInput(container),
    ];

    const onResize = () => {
      setBreakpointClasses(container);
      const mobile = isMobile();
      search.update(mobile);
      selector.update(mobile);
      month?.resize(mobile);
    };
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!search.contains(target)) search.close();
      if (!container.querySelector('[data-js="tribe-events-view-selector"]')?.contains(target)) selector.close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (event.target as Element).closest?.('[data-js="tribe-events-view-selector"]')) selector.close();
    };
    const onLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.<HTMLAnchorElement>('a[data-js="tribe-events-view-link"]');
      const href = link?.getAttribute("href");
      if (!link || !href?.startsWith("/")) return;
      event.preventDefault();
      navigate(href);
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = (event.target as Element).closest?.<HTMLFormElement>('form[data-js="tribe-events-view-form"]');
      if (!form) return;
      event.preventDefault();
      const base = form.querySelector<HTMLInputElement>('input[name="tribe-events-views[url]"]')?.value || "/events/list";
      const keyword = form.querySelector<HTMLInputElement>('input[name="tribe-events-views[tribe-bar-search]"]')?.value.trim() || "";
      const url = new URL(base, window.location.origin);
      url.searchParams.delete("tribe-paged");
      if (keyword) url.searchParams.set("tribe-bar-search", keyword);
      else url.searchParams.delete("tribe-bar-search");
      navigate(`${url.pathname}${url.search}`);
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("click", onDocumentClick);
    container.addEventListener("keydown", onKeyDown);
    container.addEventListener("click", onLinkClick);
    container.addEventListener("submit", onSubmit);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("click", onDocumentClick);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("click", onLinkClick);
      container.removeEventListener("submit", onSubmit);
      search.destroy();
      selector.destroy();
      month?.destroy();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [kind, navigate]);

  return (
    <div
      ref={ref}
      className={`tribe-common tribe-events tribe-events-view tribe-events-view--${kind}`}
      data-js="tribe-events-view"
      data-view-manage-url="1"
      role="main"
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}

/* ---------- Datepicker (bootstrap-datepicker markup) ---------- */

export type DatepickerLabels = {
  datetime: string;
  mobile: string;
  desktop: string;
  end?: { datetime: string; mobile: string; desktop: string };
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_MIN = ["S", "M", "T", "W", "T", "F", "S"];
const WEEK_START = 1;
const MAX_MODE = 2;
const PREV_ICON = '<svg class="tribe-common-c-svgicon tribe-common-c-svgicon--caret-left tribe-events-c-top-bar__datepicker-nav-icon-svg" aria-hidden="true" viewBox="0 0 10 16" xmlns="http://www.w3.org/2000/svg"><path d="M9.7 14.4l-1.5 1.5L.3 8 8.2.1l1.5 1.5L3.3 8l6.4 6.4z"/></svg>';
const NEXT_ICON = '<svg class="tribe-common-c-svgicon tribe-common-c-svgicon--caret-right tribe-events-c-top-bar__datepicker-nav-icon-svg" aria-hidden="true" viewBox="0 0 10 16" xmlns="http://www.w3.org/2000/svg"><path d="M.3 1.6L1.8.1 9.7 8l-7.9 7.9-1.5-1.5L6.7 8 .3 1.6z"/></svg>';
const VIEW_CLASSES = ["days", "months", "years", "decades", "centuries"];
const DAY_LABEL = new Intl.DateTimeFormat("en", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

type Mode = 0 | 1 | 2;
type View = { y: number; m: number };

function compare(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/* TEC's beforeShowDay/Month/Year filters: cells before today get "past", today's cell gets "current". */
function timeClass(value: number[], today: number[]) {
  const order = compare(value, today.slice(0, value.length));
  return order < 0 ? "past" : order === 0 ? "current" : "";
}

function cls(...names: (string | false | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

function PickerTable({ title, onSwitch, onStep, head, children }: {
  title: string;
  onSwitch: () => void;
  onStep: (dir: -1 | 1) => void;
  head?: React.ReactNode;
  children: React.ReactNode;
}) {
  const arrow = (dir: "prev" | "next") => (
    <th>
      <button
        type="button"
        className={dir}
        aria-label={dir === "prev" ? "Previous" : "Next"}
        onClick={() => onStep(dir === "prev" ? -1 : 1)}
        dangerouslySetInnerHTML={{ __html: `${dir === "prev" ? PREV_ICON : NEXT_ICON}<span class="tribe-common-a11y-visual-hide">${dir === "prev" ? "Prev" : "Next"}</span>` }}
      />
    </th>
  );
  return (
    <table className="table-condensed" role="grid">
      <thead>
        <tr>
          <th colSpan={7} className="datepicker-title" style={{ display: "none" }}></th>
        </tr>
        <tr>
          {arrow("prev")}
          <th colSpan={5}>
            <button type="button" className="datepicker-switch" onClick={onSwitch}>{title}</button>
          </th>
          {arrow("next")}
        </tr>
        {head}
      </thead>
      {children}
      <tfoot>
        <tr style={{ display: "none" }}>
          <th colSpan={7}>
            <button type="button" className="today">Today</button>
          </th>
        </tr>
        <tr style={{ display: "none" }}>
          <th colSpan={7}>
            <button type="button" className="clear">Clear</button>
          </th>
        </tr>
      </tfoot>
    </table>
  );
}

function GridBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody>
      <tr>
        <td colSpan={7}>
          <div className="datepicker-grid">{children}</div>
        </td>
      </tr>
    </tbody>
  );
}

/* Year-based grids (years, decades, centuries) follow bootstrap-datepicker's _fill_yearsView. */
function yearItems(year: number, step: number) {
  const first = Math.floor(year / (step * 10)) * step * 10;
  return { first, last: first + step * 9, items: Array.from({ length: 12 }, (_, i) => first + (i - 1) * step) };
}

export function TecDatepicker({ kind, keyword, labels, inputValue, selectedDate, today }: {
  kind: "list" | "month" | "day";
  keyword: string;
  labels: DatepickerLabels;
  inputValue: string;
  selectedDate: string;
  today: string;
}) {
  const router = useRouter();
  const minMode: Mode = kind === "month" ? 1 : 0;
  const selected = parseYmd(selectedDate);
  const now = parseYmd(today);
  const todayParts = [now.y, now.m - 1, now.d];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(minMode);
  const [view, setView] = useState<View>({ y: selected.y, m: selected.m - 1 });
  const [focusTick, setFocusTick] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; zIndex?: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    setOpen(false);
    setPosition(null);
    setMode(minMode);
    buttonRef.current?.focus();
  }, [minMode]);

  const show = () => {
    setMode(minMode);
    setView({ y: selected.y, m: selected.m - 1 });
    setOpen(true);
    setFocusTick((tick) => tick + 1);
    inputRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !inputRef.current || !containerRef.current) return;
    const input = inputRef.current.getBoundingClientRect();
    const container = containerRef.current.getBoundingClientRect();
    const zIndexes = [0];
    for (let node = inputRef.current.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const value = getComputedStyle(node).zIndex;
      if (value !== "auto" && Number(value) !== 0) zIndexes.push(Number(value));
    }
    setPosition({ top: input.top - container.top + input.height, left: input.left - container.left, zIndex: Math.max(...zIndexes) + 10 });
  }, [open]);

  useEffect(() => {
    if (!open || !focusTick) return;
    const timer = window.setTimeout(() => {
      const grid = pickerRef.current?.querySelector(`.datepicker-${VIEW_CLASSES[mode]}`);
      const target =
        grid?.querySelector<HTMLButtonElement>("button.focused:not([disabled])") ||
        grid?.querySelector<HTMLButtonElement>("button.active:not([disabled])") ||
        grid?.querySelector<HTMLButtonElement>("button.day:not([disabled]), button.month:not([disabled]), button.year:not([disabled])");
      target?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, mode, focusTick]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (pickerRef.current?.contains(target) || buttonRef.current?.contains(target) || inputRef.current?.contains(target)) return;
      hide();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, hide]);

  const go = (href: string) => {
    setOpen(false);
    setPosition(null);
    router.push(href, { scroll: false });
  };

  const pickDay = (time: number) => {
    const date = new Date(time);
    const ymd = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    go(kind === "day" ? dayUrl(ymd, keyword) : listUrl({ keyword, date: ymd }));
  };

  const pickMonth = (m: number) => {
    if (mode === minMode) {
      go(monthUrl(`${view.y}-${String(m + 1).padStart(2, "0")}`, keyword));
      return;
    }
    setView({ y: view.y, m });
    setMode(0);
    setFocusTick((tick) => tick + 1);
  };

  const pickYear = (y: number) => {
    setView({ y, m: view.m });
    setMode(1);
    setFocusTick((tick) => tick + 1);
  };

  const step = (dir: -1 | 1) => {
    const months = mode === 0 ? dir : dir * 12 * (mode === 2 ? 10 : 1);
    const date = new Date(Date.UTC(view.y, view.m + months, 1));
    setView({ y: date.getUTCFullYear(), m: date.getUTCMonth() });
  };

  const zoomOut = () => {
    if (mode >= MAX_MODE) return;
    setMode((mode + 1) as Mode);
    setFocusTick((tick) => tick + 1);
  };

  /* Arrow keys move focus around the visible grid, like bootstrap-datepicker's _handleGridArrowKeys. */
  const onPickerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      hide();
      return;
    }
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: mode === 0 ? -7 : -4, ArrowDown: mode === 0 ? 7 : 4 };
    const move = moves[event.key];
    const current = event.target as HTMLElement;
    if (!move || !current.matches("button.day, button.month, button.year")) return;
    event.preventDefault();
    const buttons = Array.from(pickerRef.current?.querySelectorAll<HTMLButtonElement>(`.datepicker-${VIEW_CLASSES[mode]} button.day, .datepicker-${VIEW_CLASSES[mode]} .datepicker-grid > button`) || []);
    const next = buttons[buttons.indexOf(current as HTMLButtonElement) + move];
    if (next) next.focus();
    else step(move < 0 ? -1 : 1);
  };

  let picker: React.ReactNode = null;
  if (open) {
    const lastPrev = new Date(Date.UTC(view.y, view.m, 0));
    const startDay = lastPrev.getUTCDate() - ((lastPrev.getUTCDay() - WEEK_START + 7) % 7);
    const start = Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), startDay);
    const weeks = Array.from({ length: 6 }, (_, week) =>
      Array.from({ length: 7 }, (_, i) => {
        const time = start + (week * 7 + i) * 86_400_000;
        const date = new Date(time);
        const parts = [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
        const position = compare(parts.slice(0, 2), [view.y, view.m]);
        const active = compare(parts, [selected.y, selected.m - 1, selected.d]) === 0;
        return (
          <td key={time}>
            <button
              type="button"
              className={cls(position < 0 && "old", position > 0 && "new", active && "active", "day", timeClass(parts, todayParts))}
              data-date={time}
              aria-label={DAY_LABEL.format(date)}
              aria-selected={active ? "true" : undefined}
              onClick={() => pickDay(time)}
            >
              {parts[2]}
            </button>
          </td>
        );
      }),
    );
    const years = yearItems(view.y, 1);
    const decades = yearItems(view.y, 10);
    const centuries = yearItems(view.y, 100);
    const views = [
      <PickerTable
        key="days"
        title={`${MONTHS[view.m]} ${view.y}`}
        onSwitch={zoomOut}
        onStep={step}
        head={
          <tr>
            {Array.from({ length: 7 }, (_, i) => (WEEK_START + i) % 7).map((day) => (
              <th key={day} className="dow" scope="col" aria-label={DAY_NAMES[day]} title={DAY_NAMES[day]}>
                <abbr title={DAY_NAMES[day]}>{DAYS_MIN[day]}</abbr>
              </th>
            ))}
          </tr>
        }
      >
        <tbody>
          {weeks.map((cells, week) => (
            <tr key={week}>{cells}</tr>
          ))}
        </tbody>
      </PickerTable>,
      <PickerTable key="months" title={String(view.y)} onSwitch={zoomOut} onStep={step}>
        <GridBody>
          {MONTHS_SHORT.map((label, m) => (
            <button
              key={label}
              type="button"
              className={cls("month", m === view.m && "focused", view.y === selected.y && m === selected.m - 1 && "active", timeClass([view.y, m], todayParts))}
              aria-label={`${MONTHS[m]} ${view.y}`}
              onClick={() => pickMonth(m)}
            >
              {label}
            </button>
          ))}
        </GridBody>
      </PickerTable>,
      <PickerTable key="years" title={`${years.first}-${years.last}`} onSwitch={zoomOut} onStep={step}>
        <GridBody>
          {years.items.map((year, i) => (
            <button
              key={year}
              type="button"
              className={cls("year", i === 0 && "old", i === 11 && "new", year === selected.y && "active", year === view.y && "focused", timeClass([year], todayParts))}
              aria-label={String(year)}
              onClick={() => pickYear(year)}
            >
              {year}
            </button>
          ))}
        </GridBody>
      </PickerTable>,
      ...[
        { key: "decades", name: "decade", range: decades, size: 10 },
        { key: "centuries", name: "century", range: centuries, size: 100 },
      ].map(({ key, name, range, size }) => (
        <PickerTable key={key} title={`${range.first}-${range.last}`} onSwitch={zoomOut} onStep={step}>
          <GridBody>
            {range.items.map((value, i) => (
              <button
                key={value}
                type="button"
                className={cls(name, i === 0 && "old", i === 11 && "new", value === Math.floor(selected.y / size) * size && "active", value === Math.floor(view.y / size) * size && "focused")}
                aria-label={`${value} - ${value + size - 1}`}
              >
                {value}
              </button>
            ))}
          </GridBody>
        </PickerTable>
      )),
    ];
    picker = (
      <div
        ref={pickerRef}
        className="datepicker datepicker-dropdown dropdown-menu datepicker-orient-left datepicker-orient-bottom"
        role="application"
        aria-label="Calendar"
        style={{ top: position?.top ?? 0, left: position?.left ?? 0, zIndex: position?.zIndex, display: "block", visibility: position ? undefined : "hidden" }}
        onKeyDown={onPickerKeyDown}
      >
        <div className="sr-only datepicker-live-region" aria-live="polite" aria-atomic="true" style={{ display: "none" }}></div>
        {views.map((table, i) => (
          <div key={VIEW_CLASSES[i]} className={`datepicker-${VIEW_CLASSES[i]}`} style={{ display: i === mode ? "block" : "none" }}>
            {table}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="tribe-events-c-top-bar__datepicker">
      <button
        ref={buttonRef}
        className={`tribe-common-c-btn__clear tribe-common-h3 tribe-common-h--alt tribe-events-c-top-bar__datepicker-button${open ? " tribe-events-c-top-bar__datepicker-button--open" : ""}`}
        data-js="tribe-events-top-bar-datepicker-button"
        type="button"
        aria-description="Click to toggle datepicker"
        onClick={() => (open ? hide() : show())}
      >
        <time dateTime={labels.datetime} className="tribe-events-c-top-bar__datepicker-time">
          <span className="tribe-events-c-top-bar__datepicker-mobile">{labels.mobile}</span>
          <span className="tribe-events-c-top-bar__datepicker-desktop tribe-common-a11y-hidden">{labels.desktop}</span>
        </time>
        {labels.end ? (
          <>
            <span className="tribe-events-c-top-bar__datepicker-separator"> - </span>
            <time dateTime={labels.end.datetime} className="tribe-events-c-top-bar__datepicker-time">
              <span className="tribe-events-c-top-bar__datepicker-mobile">{labels.end.mobile}</span>
              <span className="tribe-events-c-top-bar__datepicker-desktop tribe-common-a11y-hidden">{labels.end.desktop}</span>
            </time>
          </>
        ) : null}
        <svg className="tribe-common-c-svgicon tribe-common-c-svgicon--caret-down tribe-events-c-top-bar__datepicker-button-icon-svg" aria-hidden="true" viewBox="0 0 10 7" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M1.008.609L5 4.6 8.992.61l.958.958L5 6.517.05 1.566l.958-.958z" className="tribe-common-c-svgicon__svg-fill" />
        </svg>
      </button>
      <label className="tribe-events-c-top-bar__datepicker-label tribe-common-a11y-visual-hide" htmlFor="tribe-events-top-bar-date">Select date.</label>
      <input
        ref={inputRef}
        type="text"
        className="tribe-events-c-top-bar__datepicker-input tribe-common-a11y-visual-hide"
        data-js="tribe-events-top-bar-date"
        id="tribe-events-top-bar-date"
        name="tribe-events-views[tribe-bar-date]"
        value={inputValue}
        tabIndex={-1}
        autoComplete="off"
        readOnly
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) hide();
        }}
      />
      <div ref={containerRef} className="tribe-events-c-top-bar__datepicker-container" data-js="tribe-events-top-bar-datepicker-container">
        {picker}
      </div>
      <template className="tribe-events-c-top-bar__datepicker-template-prev-icon" dangerouslySetInnerHTML={{ __html: PREV_ICON }} />
      <template className="tribe-events-c-top-bar__datepicker-template-next-icon" dangerouslySetInnerHTML={{ __html: NEXT_ICON }} />
    </div>
  );
}

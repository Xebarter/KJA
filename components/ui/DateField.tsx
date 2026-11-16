"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { kampalaToday } from "@/lib/accounts-format";
import "./date-field.css";

const POP_GAP = 6;
const POP_ESTIMATE = 360;
const YEAR_SPAN = 12;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type Panel = "day" | "month" | "year";

type ChangeLike = { target: { value: string; name: string }; currentTarget: { value: string; name: string } };

export type DateFieldProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  /** Custom trigger content — used for plated layouts (e.g. attendance). */
  children?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  suppressHydrationWarning?: boolean;
  onChange?: (event: ChangeLike) => void;
  onBlur?: (event: ChangeLike & { type: string }) => void;
  onFocus?: FocusEventHandler<HTMLElement>;
};

function parseIso(iso: string | undefined | null) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function toIso(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(iso: string) {
  const date = parseIso(iso);
  if (!date) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function addYears(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear() + delta, date.getUTCMonth(), 1));
}

function clampIso(iso: string, min?: string, max?: string) {
  let next = iso;
  if (min && next < min) next = min;
  if (max && next > max) next = max;
  return next;
}

function yearBounds(min?: string, max?: string) {
  const minYear = min ? Number(min.slice(0, 4)) : 1900;
  const maxYear = max ? Number(max.slice(0, 4)) : 2100;
  return { minYear, maxYear };
}

function monthBlocked(year: number, monthIndex: number, min?: string, max?: string) {
  const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const endDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const end = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  if (min && end < min) return true;
  if (max && start > max) return true;
  return false;
}

function yearBlocked(year: number, min?: string, max?: string) {
  const { minYear, maxYear } = yearBounds(min, max);
  return year < minYear || year > maxYear;
}

function decadeStart(year: number) {
  return Math.floor(year / YEAR_SPAN) * YEAR_SPAN;
}

function buildCells(view: Date) {
  const first = startOfMonth(view);
  // Monday-first: UTC Sunday=0 → 6, Monday=1 → 0
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 - offset));
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    return {
      iso: toIso(day),
      day: day.getUTCDate(),
      outside: day.getUTCMonth() !== first.getUTCMonth(),
    };
  });
}

function emitChange(onChange: DateFieldProps["onChange"], value: string, name: string) {
  if (!onChange) return;
  const target = { value, name };
  onChange({ target, currentTarget: target });
}

export function DateField({
  id,
  name = "",
  value,
  defaultValue = "",
  min,
  max,
  required,
  disabled,
  placeholder = "Pick a date",
  className = "",
  compact,
  children,
  onChange,
  onBlur,
  onFocus,
  suppressHydrationWarning,
  ...aria
}: DateFieldProps) {
  const autoId = useId();
  const fieldId = id || autoId;
  const popId = `${fieldId}-pop`;
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue || "");
  const selected = controlled ? value || "" : inner;
  const today = useMemo(() => kampalaToday(), []);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("day");
  const [flipUp, setFlipUp] = useState(false);
  const [popStyle, setPopStyle] = useState<CSSProperties | null>(null);
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState(() => startOfMonth(parseIso(selected) || parseIso(today) || new Date()));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
      setPanel("day");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (panel === "year") {
        setPanel("month");
        return;
      }
      if (panel === "month") {
        setPanel("day");
        return;
      }
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panel]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPopStyle(null);
      setPortalHost(null);
      return;
    }

    const place = () => {
      const anchor = triggerRef.current || rootRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const up = spaceBelow < POP_ESTIMATE && spaceAbove > spaceBelow;
      setFlipUp(up);

      const width = Math.min(19.5 * 16, window.innerWidth - 24);
      let left = rect.left;
      if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
      if (left < 12) left = 12;

      const style: CSSProperties = {
        position: "fixed",
        left,
        width,
        zIndex: 1200,
      };
      if (up) {
        style.top = "auto";
        style.bottom = Math.max(12, window.innerHeight - rect.top + POP_GAP);
      } else {
        style.top = rect.bottom + POP_GAP;
        style.bottom = "auto";
      }
      setPopStyle(style);

      // Keep the calendar in the dialog top-layer when open inside a modal.
      const host = rootRef.current?.closest("dialog[open]") || document.body;
      setPortalHost(host);
    };

    place();
    window.addEventListener("resize", place);
    // Capture scrolls from nested dialog/panel scrollers that move the trigger.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, view]);

  useEffect(() => {
    if (controlled) return;
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      queueMicrotask(() => setInner(defaultValue || ""));
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [controlled, defaultValue]);

  const cells = useMemo(() => buildCells(view), [view]);
  const display = selected ? formatDisplay(selected) : "";
  const custom = Boolean(children);

  const notifyForm = (next: string) => {
    requestAnimationFrame(() => {
      const el = valueRef.current;
      if (!el) return;
      if (el.value !== next) {
        const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        proto?.set?.call(el, next);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  const commit = (next: string) => {
    const clamped = next ? clampIso(next, min, max) : "";
    if (!controlled) setInner(clamped);
    emitChange(onChange, clamped, name);
    notifyForm(clamped);
  };

  const openPicker = () => {
    if (disabled) return;
    setView(startOfMonth(parseIso(selected) || parseIso(today) || new Date()));
    setPanel("day");
    setOpen(true);
  };

  const closePicker = () => {
    setOpen(false);
    setPanel("day");
    triggerRef.current?.focus();
  };

  const pick = (iso: string) => {
    if ((min && iso < min) || (max && iso > max)) return;
    commit(iso);
    closePicker();
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      openPicker();
    }
  };

  const viewYear = view.getUTCFullYear();
  const viewMonth = view.getUTCMonth();
  const monthLabel = `${MONTHS[viewMonth]} ${viewYear}`;
  const yearsAnchor = decadeStart(viewYear);
  const yearItems = Array.from({ length: YEAR_SPAN }, (_, i) => yearsAnchor + i);
  const yearRangeLabel = `${yearsAnchor} – ${yearsAnchor + YEAR_SPAN - 1}`;
  const todayDate = parseIso(today);
  const selectedDate = parseIso(selected);

  const prevMonth = addMonths(view, -1);
  const nextMonth = addMonths(view, 1);
  const prevDisabled = Boolean(min && toIso(new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth() + 1, 0))) < min);
  const nextDisabled = Boolean(max && toIso(nextMonth) > max);
  const prevYearDisabled = yearBlocked(viewYear - 1, min, max);
  const nextYearDisabled = yearBlocked(viewYear + 1, min, max);
  const prevDecadeDisabled = yearBlocked(yearsAnchor - 1, min, max);
  const nextDecadeDisabled = yearBlocked(yearsAnchor + YEAR_SPAN, min, max);

  const stepPrev = () => {
    if (panel === "day") setView((current) => addMonths(current, -1));
    else if (panel === "month") setView((current) => addYears(current, -1));
    else setView((current) => addYears(current, -YEAR_SPAN));
  };

  const stepNext = () => {
    if (panel === "day") setView((current) => addMonths(current, 1));
    else if (panel === "month") setView((current) => addYears(current, 1));
    else setView((current) => addYears(current, YEAR_SPAN));
  };

  const stepPrevDisabled = panel === "day" ? prevDisabled : panel === "month" ? prevYearDisabled : prevDecadeDisabled;
  const stepNextDisabled = panel === "day" ? nextDisabled : panel === "month" ? nextYearDisabled : nextDecadeDisabled;

  const headLabel = panel === "day" ? monthLabel : panel === "month" ? String(viewYear) : yearRangeLabel;
  const headAction =
    panel === "day"
      ? () => setPanel("month")
      : panel === "month"
        ? () => setPanel("year")
        : undefined;
  const headHint = panel === "day" ? "Choose month" : panel === "month" ? "Choose year" : undefined;

  return (
    <div
      ref={rootRef}
      className={`kja-date${open ? " is-open" : ""}${compact ? " is-compact" : ""}${custom ? " is-custom" : ""}${className ? ` ${className}` : ""}`}
      suppressHydrationWarning={suppressHydrationWarning}
    >
      <input
        ref={valueRef}
        className="kja-date-value"
        tabIndex={-1}
        aria-hidden="true"
        name={name || undefined}
        value={selected}
        required={required}
        disabled={disabled}
        readOnly
        onChange={() => {}}
        onFocus={(event) => {
          event.target.blur();
          if (!disabled) openPicker();
        }}
        onInvalid={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
          if (!disabled) openPicker();
        }}
      />
      <button
        ref={triggerRef}
        type="button"
        id={fieldId}
        className={custom ? "kja-date-trigger kja-date-plate" : "kja-date-trigger"}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={aria["aria-label"] || (custom ? display || placeholder : undefined)}
        aria-labelledby={aria["aria-labelledby"]}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
        aria-required={aria["aria-required"] ?? (required || undefined)}
        onClick={() => (open ? closePicker() : openPicker())}
        onKeyDown={onTriggerKeyDown}
        onBlur={() => {
          if (!onBlur) return;
          const target = { value: selected, name };
          onBlur({ type: "blur", target, currentTarget: target });
        }}
        onFocus={onFocus}
        suppressHydrationWarning={suppressHydrationWarning}
      >
        {custom ? (
          children
        ) : (
          <>
            <span className="kja-date-ico" aria-hidden="true">
              <i className="fa-regular fa-calendar" />
            </span>
            <span className={`kja-date-label${display ? "" : " is-empty"}`}>{display || placeholder}</span>
            <span className="kja-date-chevron" aria-hidden="true">
              <i className="fa-solid fa-chevron-down" />
            </span>
          </>
        )}
      </button>

      {open && portalHost && popStyle
        ? createPortal(
            <div
              ref={popRef}
              className={`kja-date-pop is-portal${flipUp ? " is-up" : ""}`}
              id={popId}
              role="dialog"
              aria-modal="false"
              aria-label={headLabel}
              style={popStyle}
            >
              <div className="kja-date-head">
                {headAction ? (
                  <button type="button" className="kja-date-title-btn" onClick={headAction} aria-label={headHint} title={headHint}>
                    <span>{headLabel}</span>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </button>
                ) : (
                  <p className="kja-date-title">{headLabel}</p>
                )}
                <div className="kja-date-nav">
                  <button
                    type="button"
                    aria-label={panel === "day" ? "Previous month" : panel === "month" ? "Previous year" : "Previous years"}
                    disabled={stepPrevDisabled}
                    onClick={stepPrev}
                  >
                    <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={panel === "day" ? "Next month" : panel === "month" ? "Next year" : "Next years"}
                    disabled={stepNextDisabled}
                    onClick={stepNext}
                  >
                    <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {panel === "day" ? (
                <>
                  <div className="kja-date-week" aria-hidden="true">
                    {WEEKDAYS.map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>

                  <div className="kja-date-grid" role="grid" aria-label={monthLabel}>
                    {cells.map((cell) => {
                      const blocked = Boolean((min && cell.iso < min) || (max && cell.iso > max));
                      return (
                        <button
                          key={cell.iso}
                          type="button"
                          role="gridcell"
                          className={`kja-date-day${cell.outside ? " is-out" : ""}${cell.iso === selected ? " is-selected" : ""}${cell.iso === today ? " is-today" : ""}`}
                          disabled={blocked}
                          aria-selected={cell.iso === selected}
                          aria-current={cell.iso === today ? "date" : undefined}
                          onClick={() => pick(cell.iso)}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {panel === "month" ? (
                <div className="kja-date-pick-grid" role="listbox" aria-label={`Months in ${viewYear}`}>
                  {MONTH_SHORT.map((label, monthIndex) => {
                    const blocked = monthBlocked(viewYear, monthIndex, min, max);
                    const isSelected = selectedDate?.getUTCFullYear() === viewYear && selectedDate.getUTCMonth() === monthIndex;
                    const isCurrent = todayDate?.getUTCFullYear() === viewYear && todayDate.getUTCMonth() === monthIndex;
                    return (
                      <button
                        key={label}
                        type="button"
                        role="option"
                        className={`kja-date-chip${isSelected ? " is-selected" : ""}${isCurrent ? " is-today" : ""}`}
                        disabled={blocked}
                        aria-selected={isSelected}
                        onClick={() => {
                          setView(new Date(Date.UTC(viewYear, monthIndex, 1)));
                          setPanel("day");
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {panel === "year" ? (
                <div className="kja-date-pick-grid" role="listbox" aria-label={yearRangeLabel}>
                  {yearItems.map((year) => {
                    const blocked = yearBlocked(year, min, max);
                    const isSelected = selectedDate?.getUTCFullYear() === year;
                    const isCurrent = todayDate?.getUTCFullYear() === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        role="option"
                        className={`kja-date-chip${isSelected ? " is-selected" : ""}${isCurrent ? " is-today" : ""}`}
                        disabled={blocked}
                        aria-selected={isSelected}
                        onClick={() => {
                          setView(new Date(Date.UTC(year, viewMonth, 1)));
                          setPanel("month");
                        }}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="kja-date-foot">
                <button
                  type="button"
                  onClick={() => {
                    const next = clampIso(today, min, max);
                    if ((min && today < min) || (max && today > max)) return;
                    setView(startOfMonth(parseIso(next) || parseIso(today) || new Date()));
                    setPanel("day");
                    pick(next);
                  }}
                  disabled={Boolean((min && today < min) || (max && today > max))}
                >
                  Today
                </button>
                {!required ? (
                  <button
                    type="button"
                    className="is-muted"
                    onClick={() => {
                      commit("");
                      closePicker();
                    }}
                  >
                    Clear
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </div>,
            portalHost,
          )
        : null}
    </div>
  );
}

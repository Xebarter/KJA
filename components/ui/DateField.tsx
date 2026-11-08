"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { kampalaToday } from "@/lib/accounts-format";
import "./date-field.css";

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

function clampIso(iso: string, min?: string, max?: string) {
  let next = iso;
  if (min && next < min) next = min;
  if (max && next > max) next = max;
  return next;
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
  const [flipUp, setFlipUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState(() => startOfMonth(parseIso(selected) || parseIso(today) || new Date()));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const node = rootRef.current;
      if (!node || !(event.target instanceof Node) || node.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setFlipUp(spaceBelow < 340 && rect.top > spaceBelow);
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
    setOpen(true);
  };

  const pick = (iso: string) => {
    if ((min && iso < min) || (max && iso > max)) return;
    commit(iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      openPicker();
    }
  };

  const monthLabel = `${MONTHS[view.getUTCMonth()]} ${view.getUTCFullYear()}`;
  const prevMonth = addMonths(view, -1);
  const nextMonth = addMonths(view, 1);
  const prevDisabled = Boolean(min && toIso(new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth() + 1, 0))) < min);
  const nextDisabled = Boolean(max && toIso(nextMonth) > max);

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
        onClick={() => (open ? setOpen(false) : openPicker())}
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

      {open ? (
        <div className={`kja-date-pop${flipUp ? " is-up" : ""}`} id={popId} role="dialog" aria-modal="false" aria-label={monthLabel}>
          <div className="kja-date-head">
            <p className="kja-date-title">{monthLabel}</p>
            <div className="kja-date-nav">
              <button type="button" aria-label="Previous month" disabled={prevDisabled} onClick={() => setView((current) => addMonths(current, -1))}>
                <i className="fa-solid fa-chevron-left" aria-hidden="true" />
              </button>
              <button type="button" aria-label="Next month" disabled={nextDisabled} onClick={() => setView((current) => addMonths(current, 1))}>
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </div>

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

          <div className="kja-date-foot">
            <button
              type="button"
              onClick={() => {
                const next = clampIso(today, min, max);
                if ((min && today < min) || (max && today > max)) return;
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
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                Clear
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

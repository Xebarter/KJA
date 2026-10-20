"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SIZE = 152;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

/** Green ring with a live percentage. Stays hidden for very short jobs, then climbs and finishes at 100. */
export function ProcessStatus({ active, label }: { active: boolean; label: string }) {
  const gradId = `proc-${useId().replace(/:/g, "")}`;
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pct, setPct] = useState(0);
  const [caption, setCaption] = useState(label);
  const labelRef = useRef(label);
  const valueRef = useRef(0);
  const openRef = useRef(false);
  labelRef.current = label;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (active) setCaption(label);
  }, [active, label]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let timer = 0;
    let cancelled = false;
    const clear = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };

    if (active) {
      const started = performance.now();
      setLeaving(false);
      const climb = (now: number) => {
        if (cancelled) return;
        const waited = (now - started) / 1000 - (reduce ? 0.04 : 0.16);
        // Fast early climb, then a slow creep toward 99 so a long job never looks frozen.
        const next = waited <= 0 ? 0 : reduce
          ? Math.min(90, waited * 36)
          : 70 * (1 - Math.exp(-waited / 1.1)) + 29 * (1 - Math.exp(-waited / 12));
        valueRef.current = next;
        setPct(next);
        if (next >= 4 && !openRef.current) {
          openRef.current = true;
          setCaption(labelRef.current);
          setOpen(true);
        }
        frame = requestAnimationFrame(climb);
      };
      frame = requestAnimationFrame(climb);
      return () => {
        cancelled = true;
        clear();
      };
    }

    if (!openRef.current) {
      valueRef.current = 0;
      setPct(0);
      return;
    }

    const from = valueRef.current;
    const begin = performance.now();
    const duration = reduce ? 80 : 420;
    const settle = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - begin) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (100 - from) * eased;
      valueRef.current = next;
      setPct(next);
      if (t < 1) {
        frame = requestAnimationFrame(settle);
        return;
      }
      timer = window.setTimeout(() => {
        setLeaving(true);
        timer = window.setTimeout(() => {
          openRef.current = false;
          valueRef.current = 0;
          setOpen(false);
          setLeaving(false);
          setPct(0);
        }, reduce ? 0 : 240);
      }, reduce ? 160 : 420);
    };
    frame = requestAnimationFrame(settle);
    return () => {
      cancelled = true;
      clear();
    };
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!mounted || !open) return null;

  const rounded = Math.min(100, Math.round(pct));
  const offset = CIRC * (1 - Math.min(pct, 100) / 100);

  return createPortal(
    <div className={`proc-veil${leaving ? " is-leave" : ""}`}>
      <div
        className="proc-card"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={`${rounded} percent. ${caption}`}
      >
        <div className="proc-ring">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
            <defs>
              <linearGradient id={gradId} x1="18%" y1="0%" x2="82%" y2="100%">
                <stop offset="0%" stopColor="#7de7a4" />
                <stop offset="48%" stopColor="#1f9d55" />
                <stop offset="100%" stopColor="#0d6b38" />
              </linearGradient>
            </defs>
            <circle className="proc-halo" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
            <circle className="proc-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
            <circle
              className="proc-arc"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={`url(#${gradId})`}
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="proc-figure">
            <span><strong>{rounded}</strong><small>%</small></span>
          </div>
        </div>
        <p>{caption}</p>
      </div>
    </div>,
    document.body,
  );
}

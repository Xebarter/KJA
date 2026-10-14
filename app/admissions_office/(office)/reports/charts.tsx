import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { percent } from "@/lib/office-reports";

export type Tone = "boy" | "girl" | "none" | "ok" | "warn" | "danger" | "navy" | "gold" | "med" | "violet" | "slate";
export type Segment = { value: number; tone: Tone; label: string };
export type Column = { label: string; sub?: string; href?: string; segments: Segment[] };

const n = (value: number) => value.toLocaleString("en-GB");
const vars = (values: Record<string, string | number>) => values as CSSProperties;

/** Section heading with an anchor the page nav and other pages link to. */
export function Section({ id, kicker, title, description, children }: { id: string; kicker: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="orp-section" aria-labelledby={`${id}-title`}>
      <header className="orp-section-head">
        <span>{kicker}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function Card({ id, title, description, csv, className = "", children }: { id?: string; title: string; description?: ReactNode; csv?: string; className?: string; children: ReactNode }) {
  return (
    <article id={id} className={`orp-card ${className}`}>
      <header className="orp-card-head">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {csv ? (
          <a className="orp-csv no-print" href={csv} download>
            <i className="fa-solid fa-download" aria-hidden="true" /> CSV
          </a>
        ) : null}
      </header>
      {children}
    </article>
  );
}

export function Legend({ items }: { items: { tone: Tone; label: string; value?: number }[] }) {
  return (
    <ul className="orp-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`orp-swatch is-${item.tone}`} aria-hidden="true" />
          {item.label}
          {item.value !== undefined ? <strong>{n(item.value)}</strong> : null}
        </li>
      ))}
    </ul>
  );
}

/** Stacked vertical columns, e.g. pupils per class split by sex. */
export function Columns({ label, columns, dividers = [], compact = false }: { label: string; columns: Column[]; dividers?: { before: number; label: string }[]; compact?: boolean }) {
  const totals = columns.map((column) => column.segments.reduce((sum, segment) => sum + segment.value, 0));
  const max = Math.max(1, ...totals);
  return (
    <div className={`orp-columns${compact ? " is-compact" : ""}`} role="list" aria-label={label}>
      {columns.map((column, index) => {
        const total = totals[index];
        const divider = dividers.find((entry) => entry.before === index);
        const summary = `${column.sub ?? column.label}: ${n(total)}${total ? ` (${column.segments.filter((s) => s.value).map((s) => `${n(s.value)} ${s.label}`).join(", ")})` : ""}`;
        const body = (
          <>
            <span className="orp-col-total">{total ? n(total) : ""}</span>
            <span className="orp-col-track">
              <span className="orp-col-stack" style={vars({ "--h": `${(total / max) * 100}%`, "--i": index })}>
                {column.segments.filter((segment) => segment.value).map((segment) => (
                  <span key={segment.label} className={`is-${segment.tone}`} style={{ flexGrow: segment.value }} />
                ))}
              </span>
            </span>
            <span className="orp-col-label">{column.label}</span>
            <span className="orp-tip" aria-hidden="true">
              <strong>{column.sub ?? column.label}</strong>
              {column.segments.map((segment) => (
                <span key={segment.label}><i className={`orp-swatch is-${segment.tone}`} />{segment.label}<b>{n(segment.value)}</b></span>
              ))}
            </span>
            <span className="visually-hidden">{summary}</span>
          </>
        );
        return (
          <div key={column.label} role="listitem" className={`orp-col${divider ? " has-divider" : ""}`} data-divider={divider?.label}>
            {column.href ? <Link href={column.href}>{body}</Link> : <div>{body}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Joiners above the line and leavers below it, month by month. */
export function Diverging({ months }: { months: { label: string; up: number; down: number }[] }) {
  const max = Math.max(1, ...months.flatMap((month) => [month.up, month.down]));
  return (
    <div className="orp-diverge" role="list" aria-label="Pupils joining and leaving by month">
      {months.map((month, index) => (
        <div key={month.label} role="listitem" className="orp-diverge-col" style={vars({ "--i": index })}>
          <span className="orp-diverge-up"><span style={vars({ "--h": `${(month.up / max) * 100}%` })} />{month.up ? <em>{month.up}</em> : null}</span>
          <span className="orp-diverge-label">{month.label}</span>
          <span className="orp-diverge-down"><span style={vars({ "--h": `${(month.down / max) * 100}%` })} />{month.down ? <em>{month.down}</em> : null}</span>
          <span className="visually-hidden">{month.label}: {month.up} joined, {month.down} left</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars with counts and shares. */
export function Bars({ rows, total, tone = "navy", href, limit }: { rows: [string, number][]; total: number; tone?: Tone; href?: (label: string) => string | null; limit?: number }) {
  if (!rows.length) return <p className="orp-empty">Nothing recorded yet.</p>;
  const shown = limit ? rows.slice(0, limit) : rows;
  const rest = limit ? rows.slice(limit).reduce((sum, [, count]) => sum + count, 0) : 0;
  const max = Math.max(1, ...shown.map(([, count]) => count));
  return (
    <ul className={`orp-bars is-${tone}`}>
      {shown.map(([label, count], index) => {
        const link = href?.(label);
        const inner = (
          <>
            <span className="orp-bar-label" title={label}>{label}</span>
            <span className="orp-bar-track" aria-hidden="true"><span style={vars({ "--w": `${(count / max) * 100}%`, "--i": index })} /></span>
            <strong>{n(count)}</strong>
            <small>{percent(count, total)}</small>
          </>
        );
        return <li key={label}>{link ? <Link href={link}>{inner}</Link> : <div>{inner}</div>}</li>;
      })}
      {rest ? (
        <li className="orp-bars-rest"><div><span className="orp-bar-label">{rows.length - shown.length} others</span><span /><strong>{n(rest)}</strong><small>{percent(rest, total)}</small></div></li>
      ) : null}
    </ul>
  );
}

/** A ring split into parts, with the headline figure in the middle. */
export function Donut({ parts, centre, caption }: { parts: Segment[]; centre: string; caption: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  let start = 0;
  const stops = parts.filter((part) => part.value).map((part) => {
    const from = start;
    start += (part.value / Math.max(1, total)) * 100;
    return `var(--orp-${part.tone}) ${from}% ${start}%`;
  });
  return (
    <figure className="orp-donut">
      <div className="orp-donut-ring" style={{ background: total ? `conic-gradient(${stops.join(", ")})` : "#efe9de" }} role="img" aria-label={`${caption}: ${parts.map((part) => `${part.value} ${part.label}`).join(", ")}`}>
        <span><strong>{centre}</strong><small>{caption}</small></span>
      </div>
      <figcaption>
        <ul className="orp-legend is-stacked">
          {parts.map((part) => (
            <li key={part.label}>
              <span className={`orp-swatch is-${part.tone}`} aria-hidden="true" />
              {part.label}
              <strong>{n(part.value)}</strong>
              <small>{percent(part.value, total)}</small>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** One bar divided into parts, for a quick share at a glance. */
export function Stack({ parts, label }: { parts: Segment[]; label: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div className="orp-stack-wrap">
      <div className="orp-stack" role="img" aria-label={`${label}: ${parts.map((part) => `${part.value} ${part.label}`).join(", ")}`}>
        {total ? parts.filter((part) => part.value).map((part) => (
          <span key={part.label} className={`is-${part.tone}`} style={{ flexGrow: part.value }} title={`${part.label}: ${part.value}`} />
        )) : <span className="is-empty" />}
      </div>
      <Legend items={parts.map((part) => ({ tone: part.tone, label: part.label, value: part.value }))} />
    </div>
  );
}

/** Application stages as a narrowing pipeline. */
export function Pipeline({ stages, total }: { stages: { label: string; value: number; tone: Tone }[]; total: number }) {
  const max = Math.max(1, ...stages.map((stage) => stage.value));
  return (
    <ol className="orp-pipeline">
      {stages.map((stage, index) => (
        <li key={stage.label} className={stage.value ? "" : "is-zero"}>
          <span className="orp-pipe-label">{stage.label}</span>
          <span className="orp-pipe-track" aria-hidden="true"><span className={`is-${stage.tone}`} style={vars({ "--w": `${Math.max(stage.value ? 2 : 0, (stage.value / max) * 100)}%`, "--i": index })} /></span>
          <strong>{n(stage.value)}</strong>
          <small>{percent(stage.value, total)}</small>
        </li>
      ))}
    </ol>
  );
}

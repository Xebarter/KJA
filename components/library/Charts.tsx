import Link from "next/link";
import type { RankRow, SeriesPoint, Slice } from "@/lib/library-reports";

export function LibMeter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <span className="lib-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

export function LibRankBars({
  rows,
  label,
  empty = "Nothing to show yet.",
}: {
  rows: RankRow[];
  label: string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p className="lib-empty is-compact">{empty}</p>;
  return (
    <figure className="lib-rank" aria-label={label}>
      <ol>
        {rows.map((row, index) => {
          const inner = (
            <>
              <span className="lib-rank-index">{index + 1}</span>
              <span className="lib-rank-copy">
                <strong>{row.label}</strong>
                {row.sub ? <small>{row.sub}</small> : null}
                <LibMeter value={row.value} max={max} label={`${row.label}: ${row.value}`} />
              </span>
              <em>{row.value.toLocaleString("en-GB")}</em>
            </>
          );
          return (
            <li key={row.id}>
              {row.href ? (
                <Link href={row.href} scroll={false}>
                  {inner}
                </Link>
              ) : (
                <div>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

export function LibColumnChart({
  points,
  label,
  legend,
}: {
  points: SeriesPoint[];
  label: string;
  legend?: [string, string?];
}) {
  const max = Math.max(1, ...points.map((point) => Math.max(point.value, point.secondary ?? 0)));
  if (!points.length) return <p className="lib-empty is-compact">No activity in this period.</p>;
  return (
    <figure className="lib-columns" aria-label={label}>
      {legend ? (
        <figcaption className="lib-chart-legend">
          <span>
            <i className="is-main" aria-hidden="true" /> {legend[0]}
          </span>
          {legend[1] ? (
            <span>
              <i className="is-second" aria-hidden="true" /> {legend[1]}
            </span>
          ) : null}
        </figcaption>
      ) : null}
      <ol style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((point) => (
          <li key={point.key} title={`${point.label}: ${point.value}${point.secondary !== undefined ? ` issued · ${point.secondary} returned` : ""}`}>
            <span className="lib-col-value">{point.value ? point.value.toLocaleString("en-GB") : ""}</span>
            <span className="lib-col-bars">
              <span className="lib-col is-main" style={{ height: `${(point.value / max) * 100}%` }} />
              {point.secondary !== undefined ? (
                <span className="lib-col is-second" style={{ height: `${(point.secondary / max) * 100}%` }} />
              ) : null}
            </span>
            <span className="lib-col-label">{point.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function LibDonut({ slices, label, center }: { slices: Slice[]; label: string; center?: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) return <p className="lib-empty is-compact">No data yet.</p>;

  const radius = 42;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <figure className="lib-donut" aria-label={label}>
      <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} className="lib-donut-track" />
        {slices.map((slice) => {
          const length = (slice.value / total) * circumference;
          const node = (
            <circle
              key={slice.key}
              cx="60"
              cy="60"
              r={radius}
              className={`lib-donut-arc is-${slice.tone}`}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeWidth={stroke}
            />
          );
          offset += length;
          return node;
        })}
        <text x="60" y="58" textAnchor="middle" className="lib-donut-total">
          {total.toLocaleString("en-GB")}
        </text>
        {center ? (
          <text x="60" y="74" textAnchor="middle" className="lib-donut-caption">
            {center}
          </text>
        ) : null}
      </svg>
      <ul>
        {slices.map((slice) => (
          <li key={slice.key}>
            <i className={`is-${slice.tone}`} aria-hidden="true" />
            <span>{slice.label}</span>
            <strong>{slice.value.toLocaleString("en-GB")}</strong>
            <small>{Math.round((slice.value / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </figure>
  );
}

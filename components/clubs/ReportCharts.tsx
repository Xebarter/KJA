import { ugxShort } from "@/lib/accounts-format";

const CAMPUS_TONES = ["is-a", "is-b", "is-c", "is-d"] as const;

export function ShareChart({
  rows,
  label,
}: {
  rows: { key: string; label: string; value: number }[];
  label: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) return <p className="cbr-empty">Nothing collected yet for this view.</p>;
  return (
    <div className="cbr-share" role="img" aria-label={label}>
      <div className="cbr-share-bar">
        {rows.map((row, index) => (
          <span
            key={row.key}
            className={CAMPUS_TONES[index % CAMPUS_TONES.length]}
            style={{ width: `${(row.value / total) * 100}%` }}
            title={`${row.label}: ${ugxShort(row.value)}`}
          />
        ))}
      </div>
      <ul className="cbr-share-legend">
        {rows.map((row, index) => (
          <li key={row.key}>
            <i className={CAMPUS_TONES[index % CAMPUS_TONES.length]} aria-hidden="true" />
            <span>{row.label}</span>
            <strong>{Math.round((row.value / total) * 100)}%</strong>
            <em>{ugxShort(row.value)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizonBars({
  rows,
  label,
  valueKey = "collected",
}: {
  rows: { key: string; label: string; collected: number; expected: number; rate: number }[];
  label: string;
  valueKey?: "collected" | "expected";
}) {
  if (!rows.length) return <p className="cbr-empty">Nothing to chart yet.</p>;
  const max = Math.max(1, ...rows.map((row) => Math.max(row.collected, row.expected)));
  return (
    <figure className="cbr-horizon" aria-label={label}>
      <ol>
        {rows.map((row, index) => (
          <li key={row.key}>
            <div className="cbr-horizon-copy">
              <span className="cbr-horizon-rank">{index + 1}</span>
              <div>
                <strong>{row.label}</strong>
                <small>
                  {ugxShort(row.collected)} of {ugxShort(row.expected)} · {row.rate}%
                </small>
              </div>
              <em>{row.rate}%</em>
            </div>
            <div className="cbr-horizon-track" aria-hidden="true">
              <span className="is-expected" style={{ width: `${(row.expected / max) * 100}%` }} />
              <span className="is-collected" style={{ width: `${(row[valueKey] / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
      <figcaption>
        <span><i className="is-collected" aria-hidden="true" /> Collected</span>
        <span><i className="is-expected" aria-hidden="true" /> Expected</span>
      </figcaption>
    </figure>
  );
}

export function StackedMonths({
  rows,
  series,
  label,
}: {
  rows: { key: string; label: string; sub: string; byCampus: Record<string, number>; total: number }[];
  series: { key: string; label: string }[];
  label: string;
}) {
  const visible = rows.filter((row) => row.total > 0);
  const start = rows.findIndex((row) => row.total > 0);
  const months = start < 0 ? [] : rows.slice(start);
  if (!months.length || !visible.length) return <p className="cbr-empty">No club receipts in the last 12 months.</p>;
  const max = Math.max(1, ...months.map((row) => row.total));
  return (
    <figure className="cbr-stack" aria-label={label}>
      <figcaption className="cbr-stack-legend">
        {series.map((item, index) => (
          <span key={item.key}>
            <i className={CAMPUS_TONES[index % CAMPUS_TONES.length]} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </figcaption>
      <ol style={{ gridTemplateColumns: `repeat(${months.length}, minmax(3.25rem, 1fr))` }}>
        {months.map((month) => (
          <li key={month.key} title={`${month.label} ${month.sub}: ${ugxShort(month.total)}`}>
            <span className="cbr-stack-value">{month.total ? ugxShort(month.total) : ""}</span>
            <span className="cbr-stack-bars" style={{ height: `${Math.max(8, (month.total / max) * 100)}%` }}>
              {series.map((item, index) => {
                const value = month.byCampus[item.key] || 0;
                if (!value || !month.total) return null;
                return (
                  <span
                    key={item.key}
                    className={CAMPUS_TONES[index % CAMPUS_TONES.length]}
                    style={{ flexGrow: value, flexBasis: 0 }}
                  />
                );
              })}
            </span>
            <span className="cbr-stack-label">
              {month.label}
              {month.sub ? <small>{month.sub}</small> : null}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function MethodMix({
  rows,
}: {
  rows: { key: string; label: string; count: number; total: number; share: number }[];
}) {
  if (!rows.length) return <p className="cbr-empty">No receipts this term.</p>;
  return (
    <ul className="cbr-methods">
      {rows.map((method) => (
        <li key={method.key}>
          <span>
            {method.label}
            <small>
              {method.count} {method.count === 1 ? "receipt" : "receipts"}
            </small>
          </span>
          <strong>{ugxShort(method.total)}</strong>
          <em>{method.share}%</em>
          <span className="cbr-meter" aria-hidden="true">
            <span style={{ width: `${method.share}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

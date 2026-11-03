/** Lightweight SVG charts for the public online report (mobile-first). */

type BarItem = { label: string; value: number | null; tone?: "high" | "mid" | "low" | "" };

function toneFill(tone?: string) {
  if (tone === "high") return "var(--kor-high)";
  if (tone === "mid") return "var(--kor-mid)";
  if (tone === "low") return "var(--kor-low)";
  return "var(--kor-navy)";
}

function scoreTone(value: number | null): BarItem["tone"] {
  if (value == null) return "";
  if (value >= 75) return "high";
  if (value >= 50) return "mid";
  return "low";
}

export function KorBarChart({
  items,
  max = 100,
  unit = "%",
}: {
  items: BarItem[];
  max?: number;
  unit?: string;
}) {
  if (!items.length) return null;
  const width = 320;
  const row = 28;
  const gap = 10;
  const labelW = 88;
  const chartW = width - labelW - 44;
  const height = items.length * (row + gap) - gap;

  return (
    <svg className="kor-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart">
      {items.map((item, index) => {
        const y = index * (row + gap);
        const value = item.value == null ? 0 : Math.max(0, Math.min(max, item.value));
        const bar = (value / max) * chartW;
        const fill = toneFill(item.tone || scoreTone(item.value));
        return (
          <g key={`${item.label}-${index}`} transform={`translate(0 ${y})`}>
            <text x={0} y={row / 2 + 4} className="kor-chart-label">
              {item.label.length > 14 ? `${item.label.slice(0, 13)}…` : item.label}
            </text>
            <rect x={labelW} y={4} width={chartW} height={row - 8} rx={8} className="kor-chart-track" />
            <rect x={labelW} y={4} width={Math.max(bar, item.value == null ? 0 : 4)} height={row - 8} rx={8} fill={fill} opacity={0.92} />
            <text x={width} y={row / 2 + 4} textAnchor="end" className="kor-chart-value">
              {item.value == null ? "—" : `${item.value}${unit}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function KorLineChart({
  items,
  max = 100,
  unit = "%",
}: {
  items: { label: string; value: number | null; current?: boolean }[];
  max?: number;
  unit?: string;
}) {
  const points = items.filter((item) => item.value != null) as { label: string; value: number; current?: boolean }[];
  if (points.length < 2) {
    return <KorBarChart items={items.map((item) => ({ label: item.label, value: item.value }))} max={max} unit={unit} />;
  }

  const width = 320;
  const height = 160;
  const padX = 18;
  const padY = 18;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2 - 22;
  const coords = points.map((item, index) => {
    const x = padX + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
    const y = padY + innerH - (Math.max(0, Math.min(max, item.value)) / max) * innerH;
    return { ...item, x, y };
  });
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");

  return (
    <svg className="kor-chart kor-chart-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Term trend">
      <path d={`M${padX},${padY + innerH} H${padX + innerW}`} className="kor-chart-axis" />
      <path d={path} className="kor-chart-stroke" fill="none" />
      {coords.map((point) => (
        <g key={point.label}>
          <circle cx={point.x} cy={point.y} r={point.current ? 5.5 : 4} className={point.current ? "kor-chart-dot is-current" : "kor-chart-dot"} />
          <text x={point.x} y={height - 4} textAnchor="middle" className="kor-chart-caption">
            {point.label.length > 10 ? `${point.label.slice(0, 9)}…` : point.label}
          </text>
          <text x={point.x} y={point.y - 10} textAnchor="middle" className="kor-chart-value">
            {point.value}{unit}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function KorStackBar({
  segments,
}: {
  segments: { label: string; value: number; tone: string }[];
}) {
  const total = segments.reduce((sum, row) => sum + row.value, 0);
  if (!total) return null;
  return (
    <div className="kor-stack" role="img" aria-label="Attendance mix">
      <div className="kor-stack-track">
        {segments.filter((row) => row.value > 0).map((row) => (
          <span key={row.label} className={`is-${row.tone}`} style={{ flexGrow: row.value }} title={`${row.label}: ${row.value}`} />
        ))}
      </div>
      <ul className="kor-stack-legend">
        {segments.map((row) => (
          <li key={row.label}>
            <i className={`is-${row.tone}`} aria-hidden="true" />
            {row.label} <strong>{row.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

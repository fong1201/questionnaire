export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

/**
 * Horizontal single-series bar chart: one hue (magnitude), values labelled at the bar tip,
 * and a hover/focus tooltip with the share of the total.
 */
export function BarList({ data, total, unit }: { data: BarDatum[]; total: number; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="bars">
      {data.map((d) => {
        const share = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0';
        const tooltip = `${d.label}: ${d.value.toLocaleString()} ${unit} (${share}%)`;
        return (
          <li key={d.key} className="bar-row" tabIndex={0} aria-label={tooltip}>
            <span className="bar-label">{d.label}</span>
            <span className="bar-track">
              <span className="bar" style={{ width: `${(d.value / max) * 100}%` }} />
              <span className="bar-value">{d.value.toLocaleString()}</span>
            </span>
            <span className="tooltip" role="tooltip">{tooltip}</span>
          </li>
        );
      })}
    </ul>
  );
}

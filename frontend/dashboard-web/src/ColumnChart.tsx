import type { TimelineBucket } from '@questionnaire/shared';

/** Rounds the axis maximum up to 1, 2 or 5 x 10^n so gridlines land on round numbers. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * magnitude * 4 >= value) ?? 10;
  return step * magnitude * 4;
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Votes per hour as columns (one series, one axis). Hover or focus a column for the exact
 * hour, votes and participants. The accompanying table carries the same numbers.
 */
export function ColumnChart({ buckets }: { buckets: TimelineBucket[] }) {
  const max = niceMax(Math.max(0, ...buckets.map((b) => b.votes)));
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

  return (
    <div className="columns-chart">
      <div className="y-axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>{t.toLocaleString()}</span>
        ))}
      </div>
      <div className="plot">
        {ticks.map((t) => (
          <span key={t} className="gridline" style={{ bottom: `${(t / max) * 100}%` }} aria-hidden="true" />
        ))}
        <ol className="columns">
          {buckets.map((b, i) => {
            const end = new Date(Date.parse(b.hourStart) + 3_600_000).toISOString();
            const label = `${time(b.hourStart)}–${time(end)}: ${b.votes.toLocaleString()} votes from ${b.participants.toLocaleString()} participants`;
            return (
              <li key={b.hourStart} className="column-slot" tabIndex={0} aria-label={label}>
                <span className="column" style={{ height: `${(b.votes / max) * 100}%` }} />
                <span className={`tooltip ${i > buckets.length / 2 ? 'left' : ''}`} role="tooltip">{label}</span>
                {i % 4 === 0 && <span className="x-label" aria-hidden="true">{time(b.hourStart)}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

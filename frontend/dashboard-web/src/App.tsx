import type { DashboardSummary, DashboardTimeline } from '@questionnaire/shared';
import { useCallback, useEffect, useState } from 'react';
import { getSummary, getTimeline } from './api';
import { BarList } from './BarList';
import { ColumnChart } from './ColumnChart';

const REFRESH_MS = 5000;

export function App() {
  const [summary, setSummary] = useState<DashboardSummary>();
  const [timeline, setTimeline] = useState<DashboardTimeline>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([getSummary(), getTimeline(24)]);
      setSummary(s);
      setTimeline(t);
      setError(undefined);
    } catch (e) {
      // Keep showing the last good data; just flag that it is stale.
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const last24h = timeline?.buckets.reduce(
    (acc, b) => ({ votes: acc.votes + b.votes, participants: acc.participants + b.participants }),
    { votes: 0, participants: 0 },
  );

  return (
    <main className="page">
      <header className="toolbar">
        <div>
          <h1>Travel preferences: live results</h1>
          <p className="muted">
            {summary ? `Updated ${new Date(summary.generatedAt).toLocaleTimeString()} · refreshes every 5 s` : 'Loading…'}
          </p>
        </div>
      </header>

      {error && <p className="error" role="alert">Could not refresh: {error}</p>}

      {summary && (
        <>
          <section className="stats" aria-label="Totals">
            <Stat label="Participants" value={summary.participants} hint="Ballots submitted" />
            <Stat label="Countries selected" value={summary.votes} hint="Total selections across all ballots" />
            <Stat
              label="Distinct countries"
              value={summary.countriesSelected}
              hint={`With at least one vote, of ${summary.countries.length} offered`}
            />
          </section>

          <section className="grid">
            <article className="card">
              <h2>Top 3 favourite countries</h2>
              {summary.top3.length === 0 ? (
                <p className="muted">No votes yet.</p>
              ) : (
                <ol className="podium">
                  {summary.top3.map((c, i) => (
                    <li key={c.code}>
                      <span className="rank">{i + 1}</span>
                      <span className="podium-name">{c.name}</span>
                      <span className="podium-votes">
                        <strong>{c.votes.toLocaleString()}</strong> votes
                        <span className="muted">
                          {' '}· {summary.participants ? Math.round((c.votes / summary.participants) * 100) : 0}% of participants
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </article>

            <article className="card">
              <h2>Last 24 hours</h2>
              <p className="muted">
                Votes per hour{last24h && ` · ${last24h.votes.toLocaleString()} votes from ${last24h.participants.toLocaleString()} participants`}
              </p>
              {timeline && <ColumnChart buckets={timeline.buckets} />}
              {timeline && (
                <details>
                  <summary>Show data table</summary>
                  <table>
                    <thead>
                      <tr><th>Hour starting</th><th>Participants</th><th>Votes</th></tr>
                    </thead>
                    <tbody>
                      {timeline.buckets.map((b) => (
                        <tr key={b.hourStart}>
                          <td>{new Date(b.hourStart).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td>{b.participants.toLocaleString()}</td>
                          <td>{b.votes.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </article>

            <article className="card wide">
              <h2>Total votes by country</h2>
              <p className="muted">{summary.votes.toLocaleString()} votes in total</p>
              <BarList
                unit="votes"
                total={summary.votes}
                data={summary.countries.map((c) => ({ key: c.code, label: c.name, value: c.votes }))}
              />
            </article>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value.toLocaleString()}</span>
      <span className="stat-hint">{hint}</span>
    </div>
  );
}

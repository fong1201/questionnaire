import {
  COUNTRIES,
  countryName,
  type CountryVotes,
  type DashboardSummary,
  type DashboardTimeline,
  type TimelineBucket,
} from '@questionnaire/shared';

const HOUR_MS = 3_600_000;

export interface CountryTotalRow {
  countryCode: string;
  votes: number;
}

export interface HourlyRow {
  hourStart: Date;
  participants: number;
  votes: number;
}

/** Most votes first; ties broken alphabetically so the order is stable between refreshes. */
function byVotesThenName(a: CountryVotes, b: CountryVotes) {
  return b.votes - a.votes || a.name.localeCompare(b.name);
}

export function buildSummary(
  totals: CountryTotalRow[],
  participants: number,
  now: Date,
): DashboardSummary {
  const votesByCode = new Map(totals.map((t) => [t.countryCode, t.votes]));
  // Every offered country appears, plus any code that has votes but was since removed from the list.
  const codes = new Set([...COUNTRIES.map((c) => c.code), ...votesByCode.keys()]);
  const countries = [...codes]
    .map((code) => ({ code, name: countryName(code), votes: votesByCode.get(code) ?? 0 }))
    .sort(byVotesThenName);

  return {
    participants,
    votes: countries.reduce((sum, c) => sum + c.votes, 0),
    countriesSelected: countries.filter((c) => c.votes > 0).length,
    countries,
    top3: countries.filter((c) => c.votes > 0).slice(0, 3),
    generatedAt: now.toISOString(),
  };
}

/** The window's first hour: `hours` buckets ending with the current (partial) hour. */
export function timelineStart(now: Date, hours: number): Date {
  const currentHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  return new Date(currentHour - (hours - 1) * HOUR_MS);
}

/** One bucket per hour, oldest first, with empty hours filled with zeros. */
export function buildTimeline(rows: HourlyRow[], now: Date, hours: number): DashboardTimeline {
  const start = timelineStart(now, hours).getTime();
  const byHour = new Map(rows.map((r) => [r.hourStart.getTime(), r]));
  const buckets: TimelineBucket[] = Array.from({ length: hours }, (_, i) => {
    const hour = start + i * HOUR_MS;
    const row = byHour.get(hour);
    return {
      hourStart: new Date(hour).toISOString(),
      participants: row?.participants ?? 0,
      votes: row?.votes ?? 0,
    };
  });
  return { hours, buckets, generatedAt: now.toISOString() };
}

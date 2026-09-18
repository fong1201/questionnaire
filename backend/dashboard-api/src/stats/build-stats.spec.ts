import { COUNTRIES } from '@questionnaire/shared';
import { buildSummary, buildTimeline, timelineStart } from './build-stats.js';

const now = new Date('2026-09-18T10:25:00.000Z');

describe('buildSummary', () => {
  it('computes totals, lists every country and ranks the top 3', () => {
    const summary = buildSummary(
      [
        { countryCode: 'JP', votes: 50 },
        { countryCode: 'KR', votes: 30 },
        { countryCode: 'SG', votes: 30 },
        { countryCode: 'TH', votes: 5 },
      ],
      40,
      now,
    );

    expect(summary.participants).toBe(40);
    expect(summary.votes).toBe(115);
    expect(summary.countriesSelected).toBe(4);
    expect(summary.countries).toHaveLength(COUNTRIES.length);
    // KR and SG tie on votes: alphabetical by name (Singapore < South Korea).
    expect(summary.top3.map((c) => c.code)).toEqual(['JP', 'SG', 'KR']);
    expect(summary.countries.at(-1)?.votes).toBe(0);
  });

  it('keeps votes for a country no longer offered', () => {
    const summary = buildSummary([{ countryCode: 'ZZ', votes: 2 }], 2, now);
    expect(summary.countries.find((c) => c.code === 'ZZ')).toEqual({ code: 'ZZ', name: 'ZZ', votes: 2 });
  });

  it('returns an empty podium before any vote', () => {
    const summary = buildSummary([], 0, now);
    expect(summary).toMatchObject({ participants: 0, votes: 0, countriesSelected: 0, top3: [] });
  });
});

describe('buildTimeline', () => {
  it('returns 24 hourly buckets ending with the current hour, zero-filled', () => {
    const timeline = buildTimeline(
      [
        { hourStart: new Date('2026-09-17T11:00:00.000Z'), participants: 2, votes: 7 },
        { hourStart: new Date('2026-09-18T10:00:00.000Z'), participants: 1, votes: 3 },
      ],
      now,
      24,
    );

    expect(timeline.buckets).toHaveLength(24);
    expect(timeline.buckets[0]).toEqual({ hourStart: '2026-09-17T11:00:00.000Z', participants: 2, votes: 7 });
    expect(timeline.buckets[23]).toEqual({ hourStart: '2026-09-18T10:00:00.000Z', participants: 1, votes: 3 });
    expect(timeline.buckets[12]).toMatchObject({ participants: 0, votes: 0 });
  });

  it('starts the window hours - 1 before the current hour', () => {
    expect(timelineStart(now, 24).toISOString()).toBe('2026-09-17T11:00:00.000Z');
  });
});

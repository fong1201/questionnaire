import type { BallotMessage } from '@questionnaire/shared';
import { aggregate, hourStart, sortedEntries } from './aggregate.js';

const ballot = (countries: string[], submittedAt: string): BallotMessage => ({
  version: 1,
  ballotId: crypto.randomUUID(),
  countries,
  submittedAt,
});

describe('aggregate', () => {
  it('folds ballots into per-country, per-hour and per-country-hour increments', () => {
    const h10 = Date.parse('2026-09-18T10:00:00.000Z');
    const h11 = Date.parse('2026-09-18T11:00:00.000Z');
    const result = aggregate([
      ballot(['JP', 'KR'], '2026-09-18T10:05:00.000Z'),
      ballot(['JP'], '2026-09-18T10:59:59.999Z'),
      ballot(['SG', 'JP', 'TH'], '2026-09-18T11:00:00.000Z'),
    ]);

    expect(Object.fromEntries(result.countries)).toEqual({ JP: 3, KR: 1, SG: 1, TH: 1 });
    expect(result.hours.get(h10)).toEqual({ participants: 2, votes: 3 });
    expect(result.hours.get(h11)).toEqual({ participants: 1, votes: 3 });
    expect(result.countryHours.get(`${h10}|JP`)).toBe(2);
    expect(result.countryHours.get(`${h11}|JP`)).toBe(1);
  });

  it('truncates timestamps to the UTC hour', () => {
    expect(new Date(hourStart('2026-09-18T23:59:59.999+08:00')).toISOString()).toBe('2026-09-18T15:00:00.000Z');
  });

  it('sorts entries so locks are always taken in the same order', () => {
    const map = new Map([['SG', 1], ['JP', 2], ['KR', 3]]);
    expect(sortedEntries(map).map(([k]) => k)).toEqual(['JP', 'KR', 'SG']);
  });
});

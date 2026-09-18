import type { BallotMessage } from '@questionnaire/shared';

export interface Increments {
  /** country code -> votes */
  countries: Map<string, number>;
  /** hour start (epoch ms) -> totals */
  hours: Map<number, { participants: number; votes: number }>;
  /** `${hour start}|${country}` -> votes */
  countryHours: Map<string, number>;
}

const HOUR_MS = 3_600_000;

export function hourStart(iso: string): number {
  return Math.floor(Date.parse(iso) / HOUR_MS) * HOUR_MS;
}

/**
 * Folds a batch of new ballots into counter increments, so a batch of N ballots costs one
 * upsert per touched counter row instead of N.
 */
export function aggregate(ballots: BallotMessage[]): Increments {
  const result: Increments = { countries: new Map(), hours: new Map(), countryHours: new Map() };
  for (const ballot of ballots) {
    const hour = hourStart(ballot.submittedAt);
    const bucket = result.hours.get(hour) ?? { participants: 0, votes: 0 };
    bucket.participants += 1;
    bucket.votes += ballot.countries.length;
    result.hours.set(hour, bucket);
    for (const country of ballot.countries) {
      result.countries.set(country, (result.countries.get(country) ?? 0) + 1);
      const key = `${hour}|${country}`;
      result.countryHours.set(key, (result.countryHours.get(key) ?? 0) + 1);
    }
  }
  return result;
}

/** Sorted entries: every transaction locks counter rows in the same order, which avoids deadlocks. */
export function sortedEntries<K extends string | number, V>(map: Map<K, V>): [K, V][] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

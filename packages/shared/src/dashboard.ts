export interface CountryVotes {
  code: string;
  name: string;
  votes: number;
}

/** GET /api/dashboard/summary */
export interface DashboardSummary {
  /** Number of ballots submitted (one per participant). */
  participants: number;
  /** Total country selections across all ballots (each selection is one vote). */
  votes: number;
  /** Number of distinct countries that received at least one vote. */
  countriesSelected: number;
  /** Every offered country with its vote count, highest first. */
  countries: CountryVotes[];
  /** The three most voted countries (ties broken by name). */
  top3: CountryVotes[];
  generatedAt: string;
}

export interface TimelineBucket {
  /** Start of the hour (UTC, ISO timestamp). */
  hourStart: string;
  participants: number;
  votes: number;
}

/** GET /api/dashboard/timeline - the last 24 hours, oldest first, one bucket per hour. */
export interface DashboardTimeline {
  hours: number;
  buckets: TimelineBucket[];
  generatedAt: string;
}

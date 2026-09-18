/** Body of POST /api/questionnaire/votes. */
export interface SubmitVoteRequest {
  /**
   * Optional client-generated UUID. Retrying with the same id never double-counts,
   * because ballots are de-duplicated by id when they are written.
   */
  ballotId?: string;
  /** 1 to MAX_SELECTIONS distinct country codes. */
  countries: string[];
}

/** Response of POST /api/questionnaire/votes (202 Accepted: the ballot is queued). */
export interface SubmitVoteResult {
  ballotId: string;
  submittedAt: string;
}

/** Message placed on the vote queue by the questionnaire API and consumed by the vote worker. */
export interface BallotMessage {
  /** Schema version, so producers and consumers can be deployed independently. */
  version: 1;
  ballotId: string;
  countries: string[];
  /** ISO timestamp taken at the API: aggregation uses event time, not processing time. */
  submittedAt: string;
}

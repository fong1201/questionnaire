import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** One submitted questionnaire (one participant). Raw data, kept for audit and re-aggregation. */
@Entity({ name: 'ballots' })
export class BallotEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Index('idx_ballots_submitted_at')
  @Column({ name: 'submitted_at', type: 'datetime', precision: 3 })
  submittedAt: Date;

  @Column({ name: 'processed_at', type: 'datetime', precision: 3 })
  processedAt: Date;
}

/** One country selected on a ballot (one vote). */
@Entity({ name: 'ballot_selections' })
@Index('idx_ballot_selections_country', ['countryCode'])
export class BallotSelectionEntity {
  @PrimaryColumn({ name: 'ballot_id', type: 'char', length: 36 })
  ballotId: string;

  @PrimaryColumn({ name: 'country_code', type: 'char', length: 2 })
  countryCode: string;
}

/** Running vote total per country. Read by the dashboard instead of counting raw rows. */
@Entity({ name: 'country_totals' })
export class CountryTotalEntity {
  @PrimaryColumn({ name: 'country_code', type: 'char', length: 2 })
  countryCode: string;

  @Column({ type: 'bigint', unsigned: true })
  votes: string;
}

/** Participants and votes per UTC hour. Summing it gives the overall totals. */
@Entity({ name: 'hourly_totals' })
export class HourlyTotalEntity {
  @PrimaryColumn({ name: 'hour_start', type: 'datetime' })
  hourStart: Date;

  @Column({ type: 'int', unsigned: true })
  participants: number;

  @Column({ type: 'int', unsigned: true })
  votes: number;
}

/** Votes per country per UTC hour. Enables time-windowed rankings (e.g. top countries today). */
@Entity({ name: 'country_hourly_totals' })
export class CountryHourlyTotalEntity {
  @PrimaryColumn({ name: 'hour_start', type: 'datetime' })
  hourStart: Date;

  @PrimaryColumn({ name: 'country_code', type: 'char', length: 2 })
  countryCode: string;

  @Column({ type: 'int', unsigned: true })
  votes: number;
}

export const ENTITIES = [
  BallotEntity,
  BallotSelectionEntity,
  CountryTotalEntity,
  HourlyTotalEntity,
  CountryHourlyTotalEntity,
];

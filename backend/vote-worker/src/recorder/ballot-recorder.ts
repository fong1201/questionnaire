import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { BallotMessage } from '@questionnaire/shared';
import { DataSource, type EntityManager } from 'typeorm';
import { aggregate, sortedEntries } from './aggregate.js';

const RETRYABLE_ERRORS = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const MAX_ATTEMPTS = 4;

export interface RecordResult {
  /** Ballots written for the first time. */
  inserted: number;
  /** Ballots already present (redelivered messages or client retries). */
  duplicates: number;
}

@Injectable()
export class BallotRecorder {
  private readonly logger = new Logger(BallotRecorder.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Writes a batch in one transaction: raw ballots first (de-duplicated by id), then counter
   * increments for the ballots that were new. Safe to call again with the same ballots.
   */
  async record(ballots: BallotMessage[]): Promise<RecordResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.dataSource.transaction((manager) => this.write(manager, ballots));
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (!code || !RETRYABLE_ERRORS.has(code) || attempt >= MAX_ATTEMPTS) throw error;
        this.logger.warn(`${code} on attempt ${attempt}, retrying batch of ${ballots.length}`);
        await new Promise((r) => setTimeout(r, 20 * 2 ** attempt + Math.random() * 50));
      }
    }
  }

  private async write(manager: EntityManager, ballots: BallotMessage[]): Promise<RecordResult> {
    const fresh: BallotMessage[] = [];
    for (const ballot of ballots) {
      const result = await manager.query('INSERT IGNORE INTO ballots (id, submitted_at) VALUES (?, ?)', [
        ballot.ballotId,
        new Date(ballot.submittedAt),
      ]);
      if (affectedRows(result) === 1) fresh.push(ballot);
    }
    if (fresh.length === 0) return { inserted: 0, duplicates: ballots.length };

    const selections = fresh.flatMap((b) => b.countries.map((c) => [b.ballotId, c]));
    await manager.query(
      `INSERT INTO ballot_selections (ballot_id, country_code) VALUES ${placeholders(selections.length, 2)}`,
      selections.flat(),
    );

    const increments = aggregate(fresh);

    const countries = sortedEntries(increments.countries);
    await manager.query(
      `INSERT INTO country_totals (country_code, votes) VALUES ${placeholders(countries.length, 2)} AS new
       ON DUPLICATE KEY UPDATE votes = country_totals.votes + new.votes`,
      countries.flat(),
    );

    const hours = sortedEntries(increments.hours);
    await manager.query(
      `INSERT INTO hourly_totals (hour_start, participants, votes) VALUES ${placeholders(hours.length, 3)} AS new
       ON DUPLICATE KEY UPDATE participants = hourly_totals.participants + new.participants,
                               votes = hourly_totals.votes + new.votes`,
      hours.flatMap(([hour, t]) => [new Date(hour), t.participants, t.votes]),
    );

    const countryHours = sortedEntries(increments.countryHours);
    await manager.query(
      `INSERT INTO country_hourly_totals (hour_start, country_code, votes) VALUES ${placeholders(countryHours.length, 3)} AS new
       ON DUPLICATE KEY UPDATE votes = country_hourly_totals.votes + new.votes`,
      countryHours.flatMap(([key, votes]) => {
        const [hour, country] = key.split('|');
        return [new Date(Number(hour)), country, votes];
      }),
    );

    return { inserted: fresh.length, duplicates: ballots.length - fresh.length };
  }
}

function placeholders(rows: number, columns: number): string {
  const row = `(${Array(columns).fill('?').join(', ')})`;
  return Array(rows).fill(row).join(', ');
}

/** mysql2 returns a ResultSetHeader for writes; TypeORM may wrap it depending on version. */
function affectedRows(result: unknown): number {
  const r = result as { affectedRows?: number; affected?: number; raw?: { affectedRows?: number } };
  return r?.affectedRows ?? r?.raw?.affectedRows ?? r?.affected ?? 0;
}

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { restartOnRotatedCredentials } from '@questionnaire/database';
import { DataSource } from 'typeorm';
import type { CountryTotalRow, HourlyRow } from './build-stats.js';

/**
 * Reads only the pre-aggregated counter tables: about one row per country and one per hour.
 * Query cost does not grow with the number of ballots.
 */
@Injectable()
export class StatsRepository {
  private readonly logger = new Logger(StatsRepository.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Runs a query; if the password was rotated, the task restarts itself with the new one. */
  private async query<T>(sql: string, parameters?: unknown[]): Promise<T> {
    try {
      return await this.db.query(sql, parameters);
    } catch (error) {
      if (restartOnRotatedCredentials(error, (m) => this.logger.error(m))) {
        // Temporary: a replacement task with the new password takes over within a minute.
        throw new ServiceUnavailableException('Reconnecting to the database, please retry shortly');
      }
      throw error;
    }
  }

  async countryTotals(): Promise<CountryTotalRow[]> {
    const rows: { country_code: string; votes: string | number }[] = await this.query(
      'SELECT country_code, votes FROM country_totals',
    );
    return rows.map((r) => ({ countryCode: r.country_code, votes: Number(r.votes) }));
  }

  async totalParticipants(): Promise<number> {
    const [row]: { participants: string | number | null }[] = await this.query(
      'SELECT SUM(participants) AS participants FROM hourly_totals',
    );
    return Number(row?.participants ?? 0);
  }

  async hourlyTotalsSince(start: Date): Promise<HourlyRow[]> {
    const rows: { hour_start: Date; participants: number; votes: number }[] = await this.query(
      'SELECT hour_start, participants, votes FROM hourly_totals WHERE hour_start >= ? ORDER BY hour_start',
      [start],
    );
    return rows.map((r) => ({
      hourStart: new Date(r.hour_start),
      participants: Number(r.participants),
      votes: Number(r.votes),
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DashboardSummary, DashboardTimeline } from '@questionnaire/shared';
import { buildSummary, buildTimeline, timelineStart } from './build-stats.js';
import { MicroCache } from './micro-cache.js';
import { StatsRepository } from './stats.repository.js';

@Injectable()
export class StatsService {
  private readonly cache: MicroCache;
  readonly cacheSeconds: number;

  constructor(
    private readonly repository: StatsRepository,
    config: ConfigService,
  ) {
    this.cacheSeconds = Number(config.get('STATS_CACHE_SECONDS') ?? 2);
    this.cache = new MicroCache(this.cacheSeconds * 1000);
  }

  summary(): Promise<DashboardSummary> {
    return this.cache.get('summary', async () => {
      const [totals, participants] = await Promise.all([
        this.repository.countryTotals(),
        this.repository.totalParticipants(),
      ]);
      return buildSummary(totals, participants, new Date());
    });
  }

  timeline(hours: number): Promise<DashboardTimeline> {
    return this.cache.get(`timeline:${hours}`, async () => {
      const now = new Date();
      const rows = await this.repository.hourlyTotalsSince(timelineStart(now, hours));
      return buildTimeline(rows, now, hours);
    });
  }
}

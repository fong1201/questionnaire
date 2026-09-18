import { Controller, Get, Query, Res } from '@nestjs/common';
import type { DashboardSummary, DashboardTimeline } from '@questionnaire/shared';
import type { Response } from 'express';
import { StatsService } from './stats.service.js';
import { TimelineQuery } from './timeline.query.js';

@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** Participants, votes, countries selected, per-country totals and the top 3. */
  @Get('summary')
  summary(@Res({ passthrough: true }) res: Response): Promise<DashboardSummary> {
    this.setCacheHeaders(res);
    return this.stats.summary();
  }

  /** Participants and votes per hour for the last `hours` hours (default 24). */
  @Get('timeline')
  timeline(
    @Query() query: TimelineQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DashboardTimeline> {
    this.setCacheHeaders(res);
    return this.stats.timeline(query.hours);
  }

  /** Lets CloudFront and browsers share results for the same short window as the in-process cache. */
  private setCacheHeaders(res: Response) {
    res.setHeader('Cache-Control', `public, max-age=${this.stats.cacheSeconds}`);
  }
}

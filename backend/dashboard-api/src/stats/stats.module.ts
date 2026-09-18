import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller.js';
import { StatsRepository } from './stats.repository.js';
import { StatsService } from './stats.service.js';

@Module({
  controllers: [StatsController],
  providers: [StatsService, StatsRepository],
})
export class StatsModule {}

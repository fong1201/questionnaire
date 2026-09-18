import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller.js';
import { QueueModule } from './queue/queue.module.js';
import { VotesModule } from './votes/votes.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), QueueModule, VotesModule],
  controllers: [HealthController],
})
export class AppModule {}

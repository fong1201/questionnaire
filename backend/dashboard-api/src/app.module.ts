import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from '@questionnaire/database';
import { HealthController } from './health/health.controller.js';
import { StatsModule } from './stats/stats.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      // Evaluated after ConfigModule has loaded any .env file.
      useFactory: () => ({ ...buildDataSourceOptions(process.env), retryAttempts: 5 }),
    }),
    StatsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

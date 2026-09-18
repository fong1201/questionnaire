import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from '@questionnaire/database';
import { BallotConsumer } from './consumer/ballot-consumer.js';
import { HealthController } from './health/health.controller.js';
import { BallotRecorder } from './recorder/ballot-recorder.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...buildDataSourceOptions(process.env), retryAttempts: 10 }),
    }),
  ],
  controllers: [HealthController],
  providers: [BallotRecorder, BallotConsumer],
})
export class AppModule {}

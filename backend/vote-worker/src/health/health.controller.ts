import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { BallotConsumer } from '../consumer/ballot-consumer.js';

@Controller('health')
export class HealthController {
  constructor(private readonly consumer: BallotConsumer) {}

  @Get()
  check() {
    const stats = this.consumer.stats;
    if (!stats.running) throw new ServiceUnavailableException({ status: 'stopped', ...stats });
    return { status: 'ok', service: 'vote-worker', ...stats };
  }
}

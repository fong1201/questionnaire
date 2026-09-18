import { Global, Module } from '@nestjs/common';
import { BallotPublisher } from './ballot-publisher.js';
import { SqsBallotPublisher } from './sqs-ballot-publisher.js';

@Global()
@Module({
  providers: [{ provide: BallotPublisher, useClass: SqsBallotPublisher }],
  exports: [BallotPublisher],
})
export class QueueModule {}

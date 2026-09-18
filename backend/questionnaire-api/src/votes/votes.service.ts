import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { BallotMessage, SubmitVoteResult } from '@questionnaire/shared';
import { randomUUID } from 'node:crypto';
import { BallotPublisher } from '../queue/ballot-publisher.js';
import type { SubmitVoteDto } from './submit-vote.dto.js';

@Injectable()
export class VotesService {
  private readonly logger = new Logger(VotesService.name);

  constructor(private readonly publisher: BallotPublisher) {}

  /**
   * Accepts a validated ballot by putting it on the queue. The database is not touched here,
   * so traffic spikes are absorbed by the queue and written at the workers' pace.
   */
  async submit(dto: SubmitVoteDto): Promise<SubmitVoteResult> {
    const message: BallotMessage = {
      version: 1,
      ballotId: dto.ballotId ?? randomUUID(),
      countries: [...dto.countries].sort(),
      submittedAt: new Date().toISOString(),
    };
    try {
      await this.publisher.publish(message);
    } catch (error) {
      this.logger.error(`Failed to queue ballot ${message.ballotId}`, error as Error);
      throw new ServiceUnavailableException('Vote could not be recorded, please retry');
    }
    return { ballotId: message.ballotId, submittedAt: message.submittedAt };
  }
}

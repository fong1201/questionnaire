import type { BallotMessage } from '@questionnaire/shared';

/**
 * Where accepted ballots are sent. The API depends on this abstraction only, so the transport
 * (SQS today; Kinesis, Kafka or RabbitMQ tomorrow) can change without touching the controllers.
 */
export abstract class BallotPublisher {
  abstract publish(message: BallotMessage): Promise<void>;
}

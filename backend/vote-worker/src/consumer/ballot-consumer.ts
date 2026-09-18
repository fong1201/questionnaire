import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';
import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { restartOnRotatedCredentials } from '@questionnaire/database';
import type { BallotMessage } from '@questionnaire/shared';
import { BallotRecorder } from '../recorder/ballot-recorder.js';
import { parseBallot } from './parse-ballot.js';

export interface ConsumerStats {
  pollers: number;
  running: boolean;
  ballotsRecorded: number;
  duplicatesSkipped: number;
  invalidMessages: number;
  failedBatches: number;
  lastBatchAt?: string;
}

/**
 * Long-polls the vote queue with several concurrent loops. Each received batch (up to 10
 * messages) is written in one transaction and deleted from the queue only after it commits,
 * so a crash means redelivery, never loss. Redelivered ballots are de-duplicated by id.
 */
@Injectable()
export class BallotConsumer implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(BallotConsumer.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;
  private readonly concurrency: number;
  private readonly waitSeconds: number;
  private readonly abort = new AbortController();
  private loops: Promise<void>[] = [];
  readonly stats: ConsumerStats;

  constructor(
    config: ConfigService,
    private readonly recorder: BallotRecorder,
  ) {
    this.queueUrl = config.getOrThrow<string>('SQS_QUEUE_URL');
    this.concurrency = Number(config.get('WORKER_CONCURRENCY') ?? 4);
    this.waitSeconds = Number(config.get('SQS_WAIT_SECONDS') ?? 20);
    const endpoint = config.get<string>('SQS_ENDPOINT');
    this.client = new SQSClient({
      region: config.get<string>('AWS_REGION') ?? 'ap-east-1',
      ...(endpoint ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {}),
    });
    this.stats = {
      pollers: this.concurrency,
      running: false,
      ballotsRecorded: 0,
      duplicatesSkipped: 0,
      invalidMessages: 0,
      failedBatches: 0,
    };
  }

  onApplicationBootstrap() {
    this.stats.running = true;
    this.loops = Array.from({ length: this.concurrency }, (_, i) => this.poll(i));
    this.logger.log(`Consuming ${this.queueUrl} with ${this.concurrency} pollers`);
  }

  async beforeApplicationShutdown() {
    this.logger.log('Stopping pollers, finishing in-flight batches');
    this.abort.abort();
    await Promise.allSettled(this.loops);
    this.stats.running = false;
    this.client.destroy();
  }

  private async poll(id: number): Promise<void> {
    let failures = 0;
    while (!this.abort.signal.aborted) {
      try {
        const { Messages = [] } = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: this.waitSeconds,
          }),
          { abortSignal: this.abort.signal },
        );
        if (Messages.length > 0) await this.handle(Messages);
        failures = 0;
      } catch (error) {
        if (this.abort.signal.aborted) break;
        // Password rotated: stop and let ECS restart the task with the new secret.
        if (restartOnRotatedCredentials(error, (m) => this.logger.error(m))) break;
        failures++;
        this.stats.failedBatches++;
        const delay = Math.min(30_000, 500 * 2 ** failures);
        this.logger.error(`Poller ${id} failed (retry in ${delay} ms): ${(error as Error).message}`);
        await sleep(delay);
      }
    }
  }

  private async handle(messages: Message[]): Promise<void> {
    const valid: { message: Message; ballot: BallotMessage }[] = [];
    for (const message of messages) {
      const parsed = parseBallot(message.Body);
      if (parsed.ok) {
        valid.push({ message, ballot: parsed.ballot });
      } else {
        // Not deleted: after maxReceiveCount deliveries SQS moves it to the dead-letter queue.
        this.stats.invalidMessages++;
        this.logger.warn(`Invalid message ${message.MessageId}: ${parsed.reason}`);
      }
    }
    if (valid.length === 0) return;

    // Same ballot twice in one batch: keep one, but acknowledge both messages.
    const unique = [...new Map(valid.map((v) => [v.ballot.ballotId, v.ballot])).values()];
    const result = await this.recorder.record(unique);
    this.stats.ballotsRecorded += result.inserted;
    this.stats.duplicatesSkipped += result.duplicates + (valid.length - unique.length);
    this.stats.lastBatchAt = new Date().toISOString();

    const deleted = await this.client.send(
      new DeleteMessageBatchCommand({
        QueueUrl: this.queueUrl,
        Entries: valid.map(({ message }, i) => ({ Id: String(i), ReceiptHandle: message.ReceiptHandle })),
      }),
    );
    if (deleted.Failed?.length) {
      // Harmless: the messages will be redelivered and skipped as duplicates.
      this.logger.warn(`Failed to delete ${deleted.Failed.length} messages`);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

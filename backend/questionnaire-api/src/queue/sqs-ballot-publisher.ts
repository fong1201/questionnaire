import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BallotMessage } from '@questionnaire/shared';
import { BallotPublisher } from './ballot-publisher.js';

@Injectable()
export class SqsBallotPublisher extends BallotPublisher implements OnApplicationShutdown {
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(config: ConfigService) {
    super();
    this.queueUrl = config.getOrThrow<string>('SQS_QUEUE_URL');
    const endpoint = config.get<string>('SQS_ENDPOINT');
    this.client = new SQSClient({
      region: config.get<string>('AWS_REGION') ?? 'ap-east-1',
      maxAttempts: 3,
      // ElasticMQ (local/Kubernetes) accepts any credentials.
      ...(endpoint ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {}),
    });
  }

  async publish(message: BallotMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          version: { DataType: 'Number', StringValue: String(message.version) },
        },
      }),
    );
  }

  onApplicationShutdown() {
    this.client.destroy();
  }
}

import { ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import type { BallotMessage } from '@questionnaire/shared';
import 'reflect-metadata';
import { BallotPublisher } from '../queue/ballot-publisher.js';
import { SubmitVoteDto } from './submit-vote.dto.js';
import { VotesService } from './votes.service.js';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: SubmitVoteDto }) as Promise<SubmitVoteDto>;

describe('SubmitVoteDto validation', () => {
  it('accepts 1 to 5 distinct known countries and normalises case', async () => {
    const dto = await validate({ countries: ['jp', 'KR', ' sg '] });
    expect(dto.countries).toEqual(['JP', 'KR', 'SG']);
  });

  it.each([
    ['no countries', { countries: [] }],
    ['more than five', { countries: ['JP', 'KR', 'SG', 'TH', 'TW', 'VN'] }],
    ['duplicates', { countries: ['JP', 'JP'] }],
    ['unknown code', { countries: ['XX'] }],
    ['not an array', { countries: 'JP' }],
    ['invalid ballot id', { ballotId: 'abc', countries: ['JP'] }],
  ])('rejects %s', async (_name, body) => {
    await expect(validate(body)).rejects.toThrow();
  });
});

describe('VotesService', () => {
  const published: BallotMessage[] = [];
  const publisher: BallotPublisher = { publish: async (m: BallotMessage) => void published.push(m) };

  beforeEach(() => (published.length = 0));

  it('queues a versioned message with sorted countries and a generated id', async () => {
    const result = await new VotesService(publisher).submit({ countries: ['SG', 'JP'] });
    expect(published).toEqual([
      { version: 1, ballotId: result.ballotId, countries: ['JP', 'SG'], submittedAt: result.submittedAt },
    ]);
    expect(result.ballotId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a client supplied ballot id so retries are idempotent', async () => {
    const ballotId = '0b5cf1d4-5f5e-4c1b-9a53-8f3f2d9a6c11';
    await new VotesService(publisher).submit({ ballotId, countries: ['JP'] });
    expect(published[0].ballotId).toBe(ballotId);
  });

  it('returns 503 when the queue is unavailable', async () => {
    const failing: BallotPublisher = { publish: () => Promise.reject(new Error('down')) };
    await expect(new VotesService(failing).submit({ countries: ['JP'] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

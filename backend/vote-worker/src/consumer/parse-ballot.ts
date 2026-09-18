import { MAX_SELECTIONS, type BallotMessage } from '@questionnaire/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The API is the gatekeeper for the list of offered countries. The worker only checks the shape,
// so adding a country never requires deploying the worker first.
const COUNTRY_CODE = /^[A-Z]{2}$/;

export type ParseResult = { ok: true; ballot: BallotMessage } | { ok: false; reason: string };

/** Validates a queue message body. Invalid messages are left on the queue and end up in the DLQ. */
export function parseBallot(body: string | undefined): ParseResult {
  let data: Partial<BallotMessage>;
  try {
    data = JSON.parse(body ?? '');
  } catch {
    return { ok: false, reason: 'body is not JSON' };
  }
  if (data?.version !== 1) return { ok: false, reason: `unsupported version ${data?.version}` };
  if (typeof data.ballotId !== 'string' || !UUID.test(data.ballotId)) {
    return { ok: false, reason: 'invalid ballotId' };
  }
  if (typeof data.submittedAt !== 'string' || Number.isNaN(Date.parse(data.submittedAt))) {
    return { ok: false, reason: 'invalid submittedAt' };
  }
  const countries = data.countries;
  if (
    !Array.isArray(countries) ||
    countries.length < 1 ||
    countries.length > MAX_SELECTIONS ||
    new Set(countries).size !== countries.length ||
    !countries.every((c) => typeof c === 'string' && COUNTRY_CODE.test(c))
  ) {
    return { ok: false, reason: 'invalid countries' };
  }
  return {
    ok: true,
    ballot: {
      version: 1,
      ballotId: data.ballotId.toLowerCase(),
      countries: [...countries].sort(),
      submittedAt: data.submittedAt,
    },
  };
}

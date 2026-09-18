import { parseBallot } from './parse-ballot.js';

const valid = {
  version: 1,
  ballotId: '0B5CF1D4-5F5E-4C1B-9A53-8F3F2D9A6C11',
  countries: ['SG', 'JP'],
  submittedAt: '2026-09-18T10:15:00.000Z',
};

describe('parseBallot', () => {
  it('accepts a valid message and normalises it', () => {
    const result = parseBallot(JSON.stringify(valid));
    expect(result).toEqual({
      ok: true,
      ballot: { ...valid, ballotId: valid.ballotId.toLowerCase(), countries: ['JP', 'SG'] },
    });
  });

  it.each([
    ['not JSON', '{'],
    ['wrong version', JSON.stringify({ ...valid, version: 2 })],
    ['bad id', JSON.stringify({ ...valid, ballotId: 'x' })],
    ['bad date', JSON.stringify({ ...valid, submittedAt: 'yesterday' })],
    ['no countries', JSON.stringify({ ...valid, countries: [] })],
    ['six countries', JSON.stringify({ ...valid, countries: ['JP', 'KR', 'SG', 'TH', 'TW', 'VN'] })],
    ['duplicates', JSON.stringify({ ...valid, countries: ['JP', 'JP'] })],
    ['lowercase code', JSON.stringify({ ...valid, countries: ['jp'] })],
  ])('rejects %s', (_name, body) => {
    expect(parseBallot(body).ok).toBe(false);
  });
});

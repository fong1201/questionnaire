import type { Country, SubmitVoteRequest, SubmitVoteResult } from '@questionnaire/shared';

const BASE = '/api/questionnaire';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new Error(message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const getCountries = () =>
  request<{ maxSelections: number; countries: Country[] }>('/countries');

export const submitVote = (vote: SubmitVoteRequest) =>
  request<SubmitVoteResult>('/votes', { method: 'POST', body: JSON.stringify(vote) });

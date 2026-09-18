import type { DashboardSummary, DashboardTimeline } from '@questionnaire/shared';

const BASE = '/api/dashboard';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `Request failed (${res.status})`);
  return body as T;
}

export const getSummary = () => request<DashboardSummary>('/summary');
export const getTimeline = (hours = 24) => request<DashboardTimeline>(`/timeline?hours=${hours}`);

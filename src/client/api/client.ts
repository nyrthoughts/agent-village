import type { ActivitySnapshot } from '../../shared/activity.js';
import type { DerivedWorkspace } from '../../server/truth/derive.js';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(path, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // The status remains the reliable error signal.
    }
    throw new ApiError(response.status, message);
  }
  return await response.json() as T;
}

export function fetchVillage(fetchImpl: typeof fetch = fetch): Promise<DerivedWorkspace> {
  return request<DerivedWorkspace>('/api/village', fetchImpl);
}

export function fetchActivity(fetchImpl: typeof fetch = fetch): Promise<ActivitySnapshot> {
  return request<ActivitySnapshot>('/api/activity', fetchImpl);
}

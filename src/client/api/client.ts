import type { ActivitySnapshot } from '../../shared/activity.js';
import type { DerivedWorkspace } from '../../server/truth/derive.js';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

class JsonEndpointUnavailableError extends Error {
  constructor() {
    super('JSON endpoint unavailable');
    this.name = 'JsonEndpointUnavailableError';
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
  const contentType = response.headers?.get?.('content-type');
  if (contentType && !contentType.includes('application/json')) {
    throw new JsonEndpointUnavailableError();
  }
  return await response.json() as T;
}

async function requestWithStaticFallback<T>(
  apiPath: string,
  staticPath: string,
  fetchImpl: typeof fetch,
): Promise<T> {
  try {
    return await request<T>(apiPath, fetchImpl);
  } catch (error) {
    const apiIsAbsent = error instanceof JsonEndpointUnavailableError
      || (error instanceof ApiError && error.status === 404);
    if (!apiIsAbsent) throw error;
    return request<T>(staticPath, fetchImpl);
  }
}

export function fetchVillage(fetchImpl: typeof fetch = fetch): Promise<DerivedWorkspace> {
  return requestWithStaticFallback<DerivedWorkspace>(
    '/api/village',
    `${import.meta.env.BASE_URL}demo/village.json`,
    fetchImpl,
  );
}

export function fetchActivity(fetchImpl: typeof fetch = fetch): Promise<ActivitySnapshot> {
  return requestWithStaticFallback<ActivitySnapshot>(
    '/api/activity',
    `${import.meta.env.BASE_URL}demo/activity.json`,
    fetchImpl,
  );
}

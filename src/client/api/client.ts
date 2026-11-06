import { clearSession, sessionHeaders } from './session.js';
import type { PlanDraft, ProjectPlan } from '../../shared/projectPlan.js';
import type { BoardSnapshot } from '../../shared/board.js';

export async function saveProjectPlan(projectId: string, plan: PlanDraft, revision: number, fetchImpl: typeof fetch = fetch): Promise<ProjectPlan> {
  return request<ProjectPlan>('/api/plan', fetchImpl, { method: 'POST', body: JSON.stringify({ projectId, plan, revision }), headers: { 'content-type': 'application/json' } });
}

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

async function request<T>(path: string, fetchImpl: typeof fetch, init?: RequestInit): Promise<T> {
  const authorization = sessionHeaders(path);
  const response = await fetchImpl(path, { ...init, headers: { accept: 'application/json', ...init?.headers, ...authorization } });
  if (!response.ok) {
    if (response.status === 401 && authorization.authorization) clearSession(authorization.authorization.slice(7));
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
  if (import.meta.env.BASE_URL !== '/') return request<T>(staticPath, fetchImpl);
  try {
    return await request<T>(apiPath, fetchImpl);
  } catch (error) {
    const apiIsAbsent = error instanceof JsonEndpointUnavailableError
      || (error instanceof ApiError && error.status === 404);
    if (!apiIsAbsent) throw error;
    return request<T>(staticPath, fetchImpl);
  }
}

export function fetchBoard(fetchImpl: typeof fetch = fetch): Promise<BoardSnapshot> {
  return requestWithStaticFallback<BoardSnapshot>('/api/board', `${import.meta.env.BASE_URL}demo/board.json`, fetchImpl);
}

/** Owner attachment of an unmatched session; written to a private file by the server. */
export async function saveMapping(sessionId: string, projectId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await request<{ ok: true }>('/api/mappings', fetchImpl, { method: 'POST', body: JSON.stringify({ sessionId, projectId }), headers: { 'content-type': 'application/json' } });
}

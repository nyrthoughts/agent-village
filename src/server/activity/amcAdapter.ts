import { z } from 'zod';
import type { ActivitySnapshot, Worker, WorkerState, WorkerTool } from '../../shared/activity.js';
import type { ActivityMapping } from '../../shared/schema.js';
import { mapWorkers } from './mapWorkers.js';
import { redactTitle } from './redact.js';

export const AMC_TIMEOUT_MS = 800;

const sourceSessionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._:-]{1,80}$/),
  tool: z.string().min(1),
  state: z.string().min(1),
  title: z.string().optional(),
  lastActivityAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
});

const dashboardSchema = z.object({ sessions: z.array(sourceSessionSchema) });

function isLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function normalizeState(value: string): WorkerState {
  return ['working', 'waiting', 'idle'].includes(value)
    ? value as WorkerState
    : 'unknown';
}

function normalizeTool(value: string): WorkerTool {
  return ['codex', 'claude', 'openclaw'].includes(value)
    ? value as WorkerTool
    : 'other';
}

function sanitizeSession(session: z.infer<typeof sourceSessionSchema>): Worker {
  const title = session.title === undefined ? undefined : redactTitle(session.title);
  return {
    id: session.id,
    tool: normalizeTool(session.tool.toLowerCase()),
    state: normalizeState(session.state.toLowerCase()),
    lastActivityAt: new Date(session.lastActivityAt).toISOString(),
    ...(title === undefined ? {} : { title }),
  };
}

export function adaptAmcPayload(
  payload: unknown,
  mappings: readonly ActivityMapping[],
  status: 'live' | 'demo',
  fetchedAt: string,
): ActivitySnapshot | undefined {
  const parsed = dashboardSchema.safeParse(payload);
  if (!parsed.success) return undefined;
  const workers = mapWorkers(parsed.data.sessions.map(sanitizeSession), mappings);
  return { status, fetchedAt, workers };
}

export interface FetchAmcOptions {
  endpoint: string;
  mappings: readonly ActivityMapping[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export async function fetchAmcActivity(options: FetchAmcOptions): Promise<ActivitySnapshot> {
  const fetchedAt = (options.now ?? (() => new Date()))().toISOString();
  const degraded = (): ActivitySnapshot => ({ status: 'degraded', fetchedAt, workers: [] });
  if (!isLocalEndpoint(options.endpoint)) return degraded();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AMC_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(options.endpoint, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return degraded();
    return adaptAmcPayload(await response.json(), options.mappings, 'live', fetchedAt) ?? degraded();
  } catch {
    return degraded();
  } finally {
    clearTimeout(timeout);
  }
}

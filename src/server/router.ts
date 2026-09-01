import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import type { ActivitySnapshot } from '../shared/activity.js';
import type { AppMode } from './mode.js';
import type { NativeActivityHub } from './activity/nativeActivity.js';
import { adaptAmcPayload, fetchAmcActivity } from './activity/amcAdapter.js';
import { loadWorkspace } from './config/load.js';
import { deriveWorkspace } from './truth/derive.js';
import { verifyWorkspaceEvidence } from './truth/evidence/verify.js';
import { hasTraversal, readStatic } from './static.js';

export interface RouterOptions {
  villagePath: string;
  distDir: string;
  mode?: AppMode;
  amcEndpoint?: string;
  demoActivityPath?: string;
  nativeActivity?: NativeActivityHub;
  now?: () => Date;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

const MAX_HOOK_BYTES = 64 * 1024;

async function readJsonBody(request: IncomingMessage): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 }
> {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (declaredLength > MAX_HOOK_BYTES) {
    request.resume();
    return { ok: false, status: 413 };
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let oversized = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_HOOK_BYTES) {
      oversized = true;
      continue;
    }
    chunks.push(buffer);
  }
  if (oversized) return { ok: false, status: 413 };
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

export function createRouter(options: RouterOptions) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const rawPath = (request.url ?? '/').split('?')[0] ?? '/';
    if (hasTraversal(rawPath)) {
      json(response, 400, { error: 'bad_path' });
      return;
    }

    if (request.method === 'POST' && (rawPath === '/api/hooks/claude' || rawPath === '/api/hooks/openclaw')) {
      if ((options.mode ?? 'demo') !== 'native' || !options.nativeActivity) {
        json(response, 404, { error: 'not_found' });
        return;
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        json(response, body.status, { error: body.status === 413 ? 'payload_too_large' : 'invalid_json' });
        return;
      }
      const accepted = rawPath.endsWith('/claude')
        ? options.nativeActivity.ingestClaude(body.value)
        : options.nativeActivity.ingestOpenClaw(body.value);
      json(response, accepted ? 202 : 422, accepted ? { accepted: true } : { error: 'invalid_hook' });
      return;
    }

    if (request.method !== 'GET') {
      json(response, 405, { error: 'method_not_allowed' });
      return;
    }

    if (rawPath === '/api/health') {
      json(response, 200, { ok: true });
      return;
    }

    if (rawPath === '/api/village') {
      const loaded = loadWorkspace(options.villagePath);
      if (!loaded.ok) {
        json(response, 422, { error: 'invalid_config', errors: loaded.errors });
        return;
      }
      const verdicts = await verifyWorkspaceEvidence(
        loaded.workspace,
        dirname(options.villagePath),
      );
      json(response, 200, deriveWorkspace(loaded.workspace, verdicts));
      return;
    }

    if (rawPath === '/api/activity') {
      const fetchedAt = (options.now ?? (() => new Date()))().toISOString();
      if ((options.mode ?? 'demo') === 'truth-only') {
        json(response, 200, { status: 'absent', fetchedAt, workers: [] } satisfies ActivitySnapshot);
        return;
      }

      const loaded = loadWorkspace(options.villagePath);
      if (!loaded.ok) {
        json(response, 422, { error: 'invalid_config', errors: loaded.errors });
        return;
      }
      const mappings = loaded.workspace.activity_mapping ?? [];

      if ((options.mode ?? 'demo') === 'native') {
        const snapshot = options.nativeActivity
          ? await options.nativeActivity.snapshot(mappings)
          : { status: 'degraded' as const, fetchedAt, workers: [] };
        json(response, 200, snapshot);
        return;
      }

      if ((options.mode ?? 'demo') === 'live') {
        const snapshot = await fetchAmcActivity({
          endpoint: options.amcEndpoint ?? 'http://127.0.0.1:3000/api/dashboard',
          mappings,
          now: options.now,
        });
        json(response, 200, snapshot);
        return;
      }

      try {
        const payload: unknown = JSON.parse(
          readFileSync(
            options.demoActivityPath ?? resolve('fixtures/amc/dashboard.nominal.json'),
            'utf8',
          ),
        );
        const snapshot = adaptAmcPayload(payload, mappings, 'demo', fetchedAt);
        json(response, 200, snapshot ?? { status: 'degraded', fetchedAt, workers: [] });
      } catch {
        json(response, 200, { status: 'degraded', fetchedAt, workers: [] });
      }
      return;
    }

    if (rawPath.startsWith('/api/')) {
      json(response, 404, { error: 'not_found' });
      return;
    }

    const result = await readStatic(rawPath, options.distDir);
    response.statusCode = result.status;
    response.setHeader('content-type', result.contentType);
    response.end(result.body);
  };
}

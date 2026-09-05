import { existsSync, readFileSync, realpathSync } from 'node:fs';
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
import type { LocalSessions } from './activity/localSessions.js';
import { observedVillage, mergeLiveSessions, projectId } from './activity/projectObserver.js';
import { AuthError, OwnerAuth } from './auth/ownerAuth.js';
import { ProjectPlans } from './projectPlans.js';
import { planWriteSchema, type ProjectPlansById } from '../shared/projectPlan.js';

export interface RouterOptions {
  villagePath: string;
  distDir: string;
  mode?: AppMode;
  amcEndpoint?: string;
  demoActivityPath?: string;
  nativeActivity?: NativeActivityHub;
  localSessions?: LocalSessions;
  focusProjects?: string[];
  now?: () => Date;
  ownerAuth?: OwnerAuth;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

const MAX_HOOK_BYTES = 64 * 1024;

export async function readJsonBody(request: IncomingMessage, timeoutMs = 5_000): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 408 | 413 }
> {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (declaredLength > MAX_HOOK_BYTES) {
    request.pause();
    return { ok: false, status: 413 };
  }
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (value: Awaited<ReturnType<typeof readJsonBody>>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.off('data', onData); request.off('end', onEnd); request.off('aborted', onAbort);
      if (!value.ok) request.pause();
      done(value);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_HOOK_BYTES) finish({ ok: false, status: 413 });
      else chunks.push(buffer);
    };
    const onEnd = () => {
      try { finish({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }); }
      catch { finish({ ok: false, status: 400 }); }
    };
    const onAbort = () => finish({ ok: false, status: 400 });
    const timer = setTimeout(() => finish({ ok: false, status: 408 }), timeoutMs);
    request.on('data', onData); request.once('end', onEnd); request.once('aborted', onAbort);
    // Keep an error listener for a late socket error after an abort/oversize rejection.
    request.once('error', onAbort);
    if (request.aborted) onAbort();
  });
}

export function createRouter(options: RouterOptions) {
  if (options.mode === 'native' && options.ownerAuth) {
    const staticPath = existsSync(options.distDir) ? realpathSync(options.distDir) : resolve(options.distDir);
    const authPath = options.ownerAuth.directory;
    if (authPath === staticPath || authPath.startsWith(`${staticPath}/`)) {
      throw new Error('Native auth directory must stay outside the static directory');
    }
  }
  const plans = options.mode === 'native' && options.ownerAuth ? new ProjectPlans(options.ownerAuth.directory) : undefined;
  const observed = async () => {
    const local = await options.localSessions!.snapshot();
    const hooks = options.nativeActivity ? await options.nativeActivity.snapshot([]) : undefined;
    return { ...local, sessions: mergeLiveSessions(local.sessions, hooks?.workers ?? []) };
  };
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const rawPath = (request.url ?? '/').split('?')[0] ?? '/';
    const canonicalOrigin = `http://localhost:${request.socket.localPort}`;
    if (options.mode === 'native') {
      const host = request.headers.host ?? '';
      const expectedHosts = [`localhost:${request.socket.localPort}`, `127.0.0.1:${request.socket.localPort}`];
      if (!expectedHosts.includes(host)
        || (request.headers.origin && request.headers.origin !== `http://${host}`)
        || (request.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(request.headers['sec-fetch-site'])))) {
        json(response, 403, { error: 'local_access_only' }); return;
      }
      response.setHeader('cache-control', 'no-store');
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('referrer-policy', 'no-referrer');
      // Inline styles position the existing React/SVG scene; scripts remain same-origin only.
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      response.setHeader('x-frame-options', 'DENY');
    }
    if (hasTraversal(rawPath)) {
      json(response, 400, { error: 'bad_path' });
      return;
    }

    if (request.method === 'GET' && rawPath === '/api/health') { json(response, 200, { ok: true }); return; }
    if (request.method === 'GET' && rawPath === '/api/auth/status') {
      if (options.mode !== 'native') { json(response, 200, { native: false }); return; }
      try {
        if (!options.ownerAuth) throw new Error('Missing native auth');
        json(response, 200, { native: true, canonicalOrigin, ...options.ownerAuth.status() });
      } catch { json(response, 503, { error: 'auth_unavailable' }); }
      return;
    }

    const isHook = rawPath === '/api/hooks/claude' || rawPath === '/api/hooks/openclaw';
    if (options.mode === 'native' && rawPath.startsWith('/api/')) {
      try {
        if (!options.ownerAuth) { json(response, 503, { error: 'auth_unavailable' }); return; }
        if (!isHook && `http://${request.headers.host}` !== canonicalOrigin) throw new AuthError(403, 'local_access_only');
        if (rawPath.startsWith('/api/auth/')) {
          if (request.method !== 'POST') { json(response, 405, { error: 'method_not_allowed' }); return; }
          if (request.headers.origin !== canonicalOrigin) throw new AuthError(403, 'local_access_only');
          options.ownerAuth.limit('auth');
          if (rawPath === '/api/auth/logout') { json(response, 200, options.ownerAuth.logout(request.headers.authorization)); return; }
          if (!['/api/auth/enroll/options', '/api/auth/enroll/verify', '/api/auth/login/options', '/api/auth/login/verify'].includes(rawPath)) {
            json(response, 404, { error: 'not_found' }); return;
          }
          if (!request.headers['content-type']?.startsWith('application/json')) throw new AuthError(400, 'invalid_json');
          const body = await readJsonBody(request);
          if (!body.ok) {
            response.setHeader('connection', 'close');
            response.once('finish', () => request.destroy());
            throw new AuthError(body.status, body.status === 413 ? 'payload_too_large' : body.status === 408 ? 'request_timeout' : 'invalid_json');
          }
          if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) throw new AuthError(400, 'invalid_json');
          const input = body.value as Record<string, unknown>;
          const result = rawPath === '/api/auth/enroll/options' ? await options.ownerAuth.enrollOptions(input.bootstrapToken, canonicalOrigin)
            : rawPath === '/api/auth/enroll/verify' ? await options.ownerAuth.enrollVerify(input, canonicalOrigin)
              : rawPath === '/api/auth/login/options' ? await options.ownerAuth.loginOptions(canonicalOrigin)
                : await options.ownerAuth.loginVerify(input, canonicalOrigin);
          json(response, 200, result); return;
        }
        if (isHook) { options.ownerAuth.authorizeHook(request.headers.authorization); options.ownerAuth.limit('hook'); }
        else options.ownerAuth.authorize(request.headers.authorization);
      } catch (error) {
        json(response, error instanceof AuthError ? error.status : 503, { error: error instanceof AuthError ? error.code : 'auth_unavailable' });
        return;
      }
    }

    if (request.method === 'POST' && (rawPath === '/api/hooks/claude' || rawPath === '/api/hooks/openclaw')) {
      if ((options.mode ?? 'demo') !== 'native' || !options.nativeActivity) {
        json(response, 404, { error: 'not_found' });
        return;
      }
      if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 400, { error: 'invalid_json' }); return; }
      const body = await readJsonBody(request);
      if (!body.ok) {
        response.setHeader('connection', 'close');
        response.once('finish', () => request.destroy());
        json(response, body.status, { error: body.status === 413 ? 'payload_too_large' : body.status === 408 ? 'request_timeout' : 'invalid_json' });
        return;
      }
      const accepted = rawPath.endsWith('/claude')
        ? options.nativeActivity.ingestClaude(body.value)
        : options.nativeActivity.ingestOpenClaw(body.value);
      json(response, accepted ? 202 : 422, accepted ? { accepted: true } : { error: 'invalid_hook' });
      return;
    }

    if (rawPath === '/api/plan' && request.method === 'POST') {
      if (!plans || !options.localSessions) { json(response, 404, { error: 'not_found' }); return; }
      if (request.headers.origin !== canonicalOrigin) { json(response, 403, { error: 'local_access_only' }); return; }
      if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 400, { error: 'invalid_json' }); return; }
      const body = await readJsonBody(request);
      if (!body.ok) {
        response.setHeader('connection', 'close'); response.once('finish', () => request.destroy());
        json(response, body.status, { error: 'invalid_plan' }); return;
      }
      const input = planWriteSchema.safeParse(body.value);
      if (!input.success) { json(response, 422, { error: 'invalid_plan' }); return; }
      const snapshot = await observed();
      const session = snapshot.sessions.find((session) => projectId(session.projectKey) === input.data.projectId);
      if (session?.projectKey.startsWith('hook:')) { json(response, 409, { error: 'project_identity_pending' }); return; }
      try {
        if (!session && !plans.read()[input.data.projectId]) { json(response, 404, { error: 'unknown_project' }); return; }
        json(response, 200, plans.save(input.data.projectId, input.data.plan, input.data.revision, 'owner', session?.project));
      }
      catch (error) {
        const code = error instanceof Error ? error.message : '';
        json(response, code === 'plan_conflict' ? 409 : code === 'plan_capacity' ? 422 : 503,
          { error: ['plan_conflict', 'plan_capacity'].includes(code) ? code : 'plan_unavailable' });
      }
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
      if (options.mode === 'native' && options.localSessions) {
        const snapshot = await observed();
        let saved: ProjectPlansById = {};
        const errors = [...snapshot.errors];
        try { saved = plans?.read() ?? {}; } catch { errors.push('Objectifs privés illisibles. Aucune progression déduite.'); }
        const village = observedVillage(snapshot.sessions, errors, options.focusProjects, saved);
        if ('coverage' in snapshot) village.observation!.coverage = snapshot.coverage as string[];
        json(response, 200, village); return;
      }
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
        if (options.localSessions) {
          const local = await observed();
          json(response, 200, { status: local.errors.length ? 'degraded' : 'live', fetchedAt, workers: local.sessions }); return;
        }
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

import { existsSync, realpathSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { AppMode } from './mode.js';
import type { NativeActivityHub } from './activity/nativeActivity.js';
import { hasTraversal, readStatic } from './static.js';
import type { LocalSessions } from './activity/localSessions.js';
import { AuthError, OwnerAuth } from './auth/ownerAuth.js';
import { ProjectPlans } from './projectPlans.js';
import { planWriteSchema } from '../shared/projectPlan.js';
import { z } from 'zod';
import { BoardError, NativeBoard, type NativeBoardOptions } from './board/native.js';
import { FixtureBoard, YamlBoard, type BoardProvider } from './board/staticBoard.js';
import { serveStream } from './board/stream.js';

export interface RouterOptions {
  villagePath: string;
  distDir: string;
  mode?: AppMode;
  amcEndpoint?: string;
  nativeActivity?: NativeActivityHub;
  localSessions?: LocalSessions | Pick<LocalSessions, 'snapshot'>;
  ownerAuth?: OwnerAuth;
  /** Fictional event fixture for demo mode. */
  boardFixturePath?: string;
  /** Native board tuning and optional sources (tests inject fakes; GitHub stays opt-in). */
  nativeBoard?: Partial<Omit<NativeBoardOptions, 'directory' | 'ownerAuth'>>;
  streamHeartbeatMs?: number;
}

const mappingSchema = z.object({ sessionId: z.string().regex(/^[A-Za-z0-9._:@/+-]{1,160}$/), projectId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/) }).strict();

function createBoard(options: RouterOptions, plans?: ProjectPlans): BoardProvider | undefined {
  const mode = options.mode ?? 'demo';
  if (mode === 'native') {
    if (!options.ownerAuth) return undefined;
    return new NativeBoard({ directory: options.ownerAuth.directory, ownerAuth: options.ownerAuth, plans,
      collector: options.localSessions as NativeBoardOptions['collector'], hooks: options.nativeActivity, ...options.nativeBoard });
  }
  if (mode === 'demo') return new FixtureBoard(options.boardFixturePath ?? resolve('fixtures/board.demo.json'));
  return new YamlBoard({ villagePath: options.villagePath, mode, amcEndpoint: options.amcEndpoint });
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
  const board = createBoard(options, plans);
  const route = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
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
      // Scripts and connections (including the event stream) remain same-origin only.
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
        else if (rawPath === '/api/stream' && request.method === 'GET') {
          // Session-bound stream: it closes on logout, rotation or expiry of this exact session.
          const session = options.ownerAuth.authorizeSession(request.headers.authorization);
          if (!(board instanceof NativeBoard)) { json(response, 503, { error: 'board_unavailable' }); return; }
          const ownerAuth = options.ownerAuth;
          board.activate();
          serveStream(request, response, board, { expiresAt: session.expiresAt, isActive: () => ownerAuth.isActive(session.key), onRevoke: (listener) => ownerAuth.onRevoke(listener) },
            { heartbeatMs: options.streamHeartbeatMs });
          return;
        }
        else options.ownerAuth.authorize(request.headers.authorization);
      } catch (error) {
        json(response, error instanceof AuthError ? error.status : 503, { error: error instanceof AuthError ? error.code : 'auth_unavailable' });
        return;
      }
    }

    if (rawPath === '/api/board' && request.method === 'GET') {
      if (!board) { json(response, 503, { error: 'board_unavailable' }); return; }
      if (board instanceof NativeBoard) board.activate();
      else await board.ready;
      json(response, 200, board.snapshot()); return;
    }
    if (rawPath === '/api/stream' && request.method === 'GET') {
      // Fictional and YAML boards have no live stream; clients fall back to polling.
      json(response, 404, { error: 'not_found' }); return;
    }
    if (rawPath === '/api/mappings' && request.method === 'POST') {
      if (!(board instanceof NativeBoard) || !options.ownerAuth) { json(response, 404, { error: 'not_found' }); return; }
      if (request.headers.origin !== canonicalOrigin) { json(response, 403, { error: 'local_access_only' }); return; }
      try { options.ownerAuth.limit('write'); } catch { json(response, 429, { error: 'rate_limited' }); return; }
      if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 400, { error: 'invalid_json' }); return; }
      const body = await readJsonBody(request);
      if (!body.ok) { response.setHeader('connection', 'close'); response.once('finish', () => request.destroy()); json(response, body.status, { error: 'invalid_mapping' }); return; }
      const input = mappingSchema.safeParse(body.value);
      if (!input.success) { json(response, 422, { error: 'invalid_mapping' }); return; }
      try { board.saveMapping(input.data.sessionId, input.data.projectId); json(response, 200, { ok: true }); }
      catch (error) {
        if (error instanceof BoardError) json(response, error.status, { error: error.code });
        else json(response, 503, { error: 'mapping_unavailable' });
      }
      return;
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
      // Optional delivery identity from the bundled producers (generated once, reused on retry).
      const header = (name: string) => { const value = request.headers[name]; return typeof value === 'string' ? value.slice(0, 160) : undefined; };
      const meta = { eventId: header('x-village-event-id'), occurredAt: header('x-village-occurred-at') };
      let accepted: boolean;
      try {
        accepted = rawPath.endsWith('/claude')
          ? options.nativeActivity.ingestClaude(body.value, meta)
          : options.nativeActivity.ingestOpenClaw(body.value, meta);
      } catch {
        // Persistence failed: the producer may retry with the same identity.
        json(response, 503, { error: 'journal_unavailable' }); return;
      }
      json(response, accepted ? 202 : 422, accepted ? { accepted: true } : { error: 'invalid_hook' });
      return;
    }

    if (rawPath === '/api/plan' && request.method === 'POST') {
      if (!plans || !(board instanceof NativeBoard)) { json(response, 404, { error: 'not_found' }); return; }
      if (request.headers.origin !== canonicalOrigin) { json(response, 403, { error: 'local_access_only' }); return; }
      if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 400, { error: 'invalid_json' }); return; }
      const body = await readJsonBody(request);
      if (!body.ok) {
        response.setHeader('connection', 'close'); response.once('finish', () => request.destroy());
        json(response, body.status, { error: 'invalid_plan' }); return;
      }
      const input = planWriteSchema.safeParse(body.value);
      if (!input.success) { json(response, 422, { error: 'invalid_plan' }); return; }
      // Project identity comes from the projection (native collectors), never from a request-time source read.
      try { json(response, 200, board.savePlan(input.data.projectId, input.data.plan, input.data.revision)); }
      catch (error) {
        const code = error instanceof BoardError ? error.code : error instanceof Error ? error.message : '';
        json(response, code === 'unknown_project' ? 404 : code === 'plan_conflict' ? 409 : code === 'plan_capacity' ? 422 : 503,
          { error: ['unknown_project', 'plan_conflict', 'plan_capacity'].includes(code) ? code : 'plan_unavailable' });
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

    // `/api/village` and `/api/activity` were replaced by `/api/board`: they read sources
    // (and ran subprocesses) inside the request. Every mode now serves the board projection.
    if (rawPath.startsWith('/api/')) {
      json(response, 404, { error: 'not_found' });
      return;
    }

    const result = await readStatic(rawPath, options.distDir);
    response.statusCode = result.status;
    response.setHeader('content-type', result.contentType);
    response.end(result.body);
  };
  return Object.assign(route, { board, close: () => board?.stop() });
}

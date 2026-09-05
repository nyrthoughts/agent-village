import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest, type Server, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVillageServer, listenLocal } from '../index.js';
import { readJsonBody } from '../router.js';
import type { LocalSessions } from '../activity/localSessions.js';
import { HookActivityStore } from '../activity/hookStore.js';
import { NativeActivityHub } from '../activity/nativeActivity.js';
import { OwnerAuth } from './ownerAuth.js';
import { prepareOwnerSetup } from './privateState.js';
import { projectId } from '../activity/projectObserver.js';

vi.mock('@simplewebauthn/server', async (original) => ({
  ...await original<typeof import('@simplewebauthn/server')>(),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: true, registrationInfo: { credential: {
    id: 'dGVzdC1jcmVkZW50aWFs', publicKey: new Uint8Array([1, 2, 3]), counter: 0,
  } } })),
}));
const servers: Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); });
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function start() {
  const directory = mkdtempSync(join(tmpdir(), 'village-auth-http-test-')); dirs.push(directory);
  const paths = prepareOwnerSetup(directory);
  const ownerAuth = new OwnerAuth(directory);
  const snapshot = vi.fn(async () => ({ sessions: [], errors: [] }));
  const hooks = new HookActivityStore();
  const server = createVillageServer({ mode: 'native', villagePath: resolve('fixtures/village.demo.yaml'), distDir: resolve('dist'),
    ownerAuth, localSessions: { snapshot } as unknown as LocalSessions,
    nativeActivity: new NativeActivityHub([], undefined, hooks) });
  servers.push(server); await listenLocal(server, 0);
  const port = (server.address() as AddressInfo).port;
  const origin = `http://localhost:${port}`;
  const bootstrapToken = readFileSync(paths.bootstrapPath, 'utf8').trim();
  const ingestion = readFileSync(paths.hookHeaderPath, 'utf8').trim().replace(/^Authorization: /, '');
  const post = (path: string, body: unknown, extra: Record<string, string> = {}) => fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin, ...extra }, body: JSON.stringify(body),
  });
  const enroll = async () => {
    const challenge = await post('/api/auth/enroll/options', { bootstrapToken }).then((response) => response.json()) as { challengeId: string };
    const response = await post('/api/auth/enroll/verify', { bootstrapToken, challengeId: challenge.challengeId, response: {} });
    expect(response.status).toBe(200);
    return (await response.json() as { token: string }).token;
  };
  return { ownerAuth, snapshot, hooks, port, origin, ingestion, post, enroll };
}

describe('native owner HTTP boundary', () => {
  it('writes plans only for the owner and exact origin, persists progress, and rejects stale or unknown projects', async () => {
    const test = await start();
    const body = { projectId: projectId('sample'), revision: 0, plan: { objective: 'An explicit stable goal',
      milestones: [{ id: 'first', title: 'First delivery', validated: true, note: 'Owner checked locally' }] } };
    expect((await test.post('/api/plan', body)).status).toBe(401);
    expect((await test.post('/api/plan', body, { authorization: test.ingestion })).status).toBe(401);
    expect(test.snapshot).not.toHaveBeenCalled();
    const token = await test.enroll(); const authorization = `Bearer ${token}`;
    expect((await fetch(`${test.origin}/api/plan`, { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body) })).status).toBe(403);
    expect((await test.post('/api/plan', body, { authorization, origin: 'https://evil.example' })).status).toBe(403);
    expect((await test.post('/api/plan', body, { authorization })).status).toBe(404);
    test.snapshot.mockResolvedValue({ errors: [], sessions: [{ id: 'hook', tool: 'claude', projectKey: 'hook:claude:only', project: 'repo', state: 'unknown', lastActivityAt: new Date().toISOString(), history: [] }] } as never);
    expect((await test.post('/api/plan', { ...body, projectId: projectId('hook:claude:only') }, { authorization })).status).toBe(409);
    test.snapshot.mockResolvedValue({ errors: [], sessions: [{ id: 'one', tool: 'codex', projectKey: 'sample', project: 'Sample', state: 'idle', lastActivityAt: new Date().toISOString(), history: [] }] } as never);
    const response = await test.post('/api/plan', body, { authorization });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ revision: 1 });
    expect((await test.post('/api/plan', body, { authorization })).status).toBe(409);
    const village = await fetch(`${test.origin}/api/village`, { headers: { authorization } }).then(r => r.json()) as import('../truth/derive.js').DerivedWorkspace;
    expect(village.projects[0]?.objective).toBe(body.plan.objective);
    expect(village.projects[0]?.tasks[0]?.progress.stage).toBe('complete');
    test.snapshot.mockResolvedValue({ errors: [], sessions: [] });
    expect((await test.post('/api/plan', { ...body, revision: 1 }, { authorization })).status).toBe(200);
    expect((await test.post('/api/plan', { ...body, revision: 1, plan: { ...body.plan, token: 'invalid' } }, { authorization })).status).toBe(422);
  });
  it('refuses to serve private credential files through the static directory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'village-auth-placement-test-')); dirs.push(directory);
    const ownerAuth = new OwnerAuth(directory);
    expect(() => createVillageServer({ mode: 'native', villagePath: '/unused', distDir: directory, ownerAuth }))
      .toThrow('outside the static directory');
  });
  it('never reads sources for absent, invalid or ingestion-only credentials', async () => {
    const test = await start();
    for (const path of ['/api/village', '/api/activity']) {
      for (const authorization of ['', `Bearer ${'x'.repeat(43)}`, test.ingestion]) {
        expect((await fetch(`${test.origin}${path}`, { headers: { authorization } })).status).toBe(401);
      }
    }
    expect(test.snapshot).not.toHaveBeenCalled();
    const token = await test.enroll();
    expect((await fetch(`${test.origin}/api/village`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    expect(test.snapshot).toHaveBeenCalledTimes(1);
    expect((await test.post('/api/auth/logout', {}, { authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await fetch(`${test.origin}/api/village`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
    expect(test.snapshot).toHaveBeenCalledTimes(1);
  });

  it('keeps health/status minimal and rejects alternate ports and cross-origin access', async () => {
    const test = await start();
    const status = await fetch(`http://127.0.0.1:${test.port}/api/auth/status`).then((response) => response.json());
    expect(status).toEqual({ native: true, enrolled: false, bootstrapReady: true, sessionMinutes: 30, canonicalOrigin: test.origin });
    expect((await fetch(`http://127.0.0.1:${test.port}/api/village`)).status).toBe(403);
    expect((await test.post('/api/auth/login/options', {}, { origin: 'http://localhost:9999' })).status).toBe(403);
    expect((await test.post('/api/auth/login/options', {}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await test.post('/api/auth/login/options', {}, { 'sec-fetch-site': 'same-site' })).status).toBe(403);
    const absentOrigin = await fetch(`${test.origin}/api/auth/login/options`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(absentOrigin.status).toBe(403);
    const response = await fetch(`${test.origin}/api/health`);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(test.snapshot).not.toHaveBeenCalled();
  });

  it('permits only the ingestion credential to send known observations, and exposes no command API', async () => {
    const test = await start(); const token = await test.enroll();
    const event = { session_id: 'a', hook_event_name: 'SessionStart', cwd: '/test/project' };
    expect((await test.post('/api/hooks/claude', event)).status).toBe(401);
    expect((await test.post('/api/hooks/claude', event, { authorization: `Bearer ${token}` })).status).toBe(401);
    expect((await test.post('/api/hooks/claude', event, { authorization: test.ingestion })).status).toBe(202);
    expect((await test.post('/api/hooks/claude', { ...event, hook_event_name: 'run_command' }, { authorization: test.ingestion })).status).toBe(422);
    expect(test.hooks.workers()).toHaveLength(1);
    for (const path of ['/api/commands', '/api/agents/start', '/api/agents/stop']) {
      expect((await fetch(`${test.origin}${path}`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(404);
      expect((await test.post(path, { command: 'ignored' }, { authorization: `Bearer ${token}` })).status).toBe(405);
    }
    expect(test.snapshot).not.toHaveBeenCalled();
  });

  it('rejects oversized streamed hooks before the sender finishes', async () => {
    const test = await start();
    const status = await new Promise<number>((done, reject) => {
      const outgoing = httpRequest({ hostname: '127.0.0.1', port: test.port, path: '/api/hooks/claude', method: 'POST',
        headers: { 'content-type': 'application/json', authorization: test.ingestion, 'transfer-encoding': 'chunked' } },
      (response) => { response.resume(); response.on('end', () => { done(response.statusCode ?? 0); outgoing.destroy(); }); });
      outgoing.once('error', reject); outgoing.setTimeout(2_000, () => { outgoing.destroy(); reject(new Error('Upload was not bounded')); });
      outgoing.write('x'.repeat(70_000)); // Deliberately never call end().
    });
    expect(status).toBe(413);
    expect(test.hooks.workers()).toEqual([]);
    expect((await fetch(`${test.origin}/api/health`)).status).toBe(200);
  });

  it('settles aborted and slow body streams without parsing observations', async () => {
    const aborted = Object.assign(new PassThrough(), { headers: {}, aborted: false });
    const result = readJsonBody(aborted as unknown as IncomingMessage);
    aborted.write('{'); aborted.emit('aborted');
    expect(await result).toEqual({ ok: false, status: 400 });
    const slow = Object.assign(new PassThrough(), { headers: {}, aborted: false });
    expect(await readJsonBody(slow as unknown as IncomingMessage, 10)).toEqual({ ok: false, status: 408 });
    aborted.destroy(); slow.destroy();
  });
});

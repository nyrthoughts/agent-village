import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVillageServer, listenLocal } from '../index.js';
import type { LocalSessions } from '../activity/localSessions.js';
import { HookActivityStore } from '../activity/hookStore.js';
import { NativeActivityHub } from '../activity/nativeActivity.js';
import { OwnerAuth } from '../auth/ownerAuth.js';
import { prepareOwnerSetup } from '../auth/privateState.js';
import { projectId } from '../activity/projectObserver.js';
import type { BoardSnapshot } from '../../shared/board.js';
import { NativeBoard } from './native.js';
import { YamlBoard } from './staticBoard.js';

vi.mock('@simplewebauthn/server', async (original) => ({
  ...await original<typeof import('@simplewebauthn/server')>(),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: true, registrationInfo: { credential: { id: 'dGVzdC1jcmVkZW50aWFs', publicKey: new Uint8Array([1, 2, 3]), counter: 0 } } })),
}));

const servers: Server[] = [];
const dirs: string[] = [];
const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
afterEach(async () => {
  for (const reader of readers.splice(0)) await reader.cancel().catch(() => undefined);
  for (const server of servers.splice(0)) await new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); });
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Frame { event: string; id?: string; data: any }

async function start(options: { capacity?: number; clock?: { now: number }; aliases?: Record<string, string> } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'village-board-test-')); dirs.push(directory);
  const paths = prepareOwnerSetup(directory);
  const clock = options.clock;
  const ownerAuth = new OwnerAuth(directory, clock ? () => clock.now : Date.now);
  const snapshot = vi.fn(async () => ({ errors: [], sessions: [{ id: 'codex:fictional', tool: 'codex' as const, role: 'lead' as const, projectKey: 'fictional-root', project: 'Orchard',
    state: 'idle' as const, title: 'Fictional', lastActivityAt: '2026-10-01T10:00:00.000Z', history: [] }] }));
  const hooks = new HookActivityStore();
  const server = createVillageServer({ mode: 'native', villagePath: resolve('fixtures/village.demo.yaml'), distDir: resolve('dist'), ownerAuth,
    localSessions: { snapshot } as unknown as LocalSessions, nativeActivity: new NativeActivityHub([], undefined, hooks),
    nativeBoard: { watch: false, pollMs: 60_000, journal: options.capacity ? { capacity: options.capacity } : undefined, aliases: options.aliases }, streamHeartbeatMs: 40 });
  servers.push(server); await listenLocal(server, 0);
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  const ingestion = readFileSync(paths.hookHeaderPath, 'utf8').trim().replace(/^Authorization: /, '');
  const bootstrapToken = readFileSync(paths.bootstrapPath, 'utf8').trim();
  const post = (path: string, body: unknown, extra: Record<string, string> = {}) => fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...extra }, body: JSON.stringify(body) });
  const enroll = async () => {
    const challenge = await post('/api/auth/enroll/options', { bootstrapToken }).then((response) => response.json()) as { challengeId: string };
    const response = await post('/api/auth/enroll/verify', { bootstrapToken, challengeId: challenge.challengeId, response: {} });
    return `Bearer ${(await response.json() as { token: string }).token}`;
  };
  const hook = (session: string, event = 'UserPromptSubmit') => post('/api/hooks/claude', { session_id: session, hook_event_name: event, cwd: '/test/orchard', prompt: 'private prompt' }, { authorization: ingestion });
  const open = async (authorization: string, query = '', lastEventId?: string) => {
    const response = await fetch(`${origin}/api/stream${query}`, { headers: { authorization, ...(lastEventId ? { 'last-event-id': lastEventId } : {}) } });
    const reader = response.body!.getReader(); readers.push(reader);
    const decoder = new TextDecoder(); let buffer = ''; const frames: Frame[] = []; let ended = false;
    void (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) { ended = true; return; }
        buffer += decoder.decode(value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index); buffer = buffer.slice(index + 2);
          const frame: Frame = { event: 'message', data: undefined };
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) frame.event = line.slice(7);
            else if (line.startsWith('id: ')) frame.id = line.slice(4);
            else if (line.startsWith('data: ')) frame.data = JSON.parse(line.slice(6));
          }
          frames.push(frame);
        }
      }
    })();
    return { response, frames, ended: () => ended, cancel: () => reader.cancel() };
  };
  return { ownerAuth, snapshot, origin, ingestion, post, enroll, hook, open, clock, directory };
}

describe('board and stream boundary', () => {
  it('requires an owner session: 401 without one, with an invalid bearer or with the ingestion header, before any source read', async () => {
    const test = await start();
    for (const path of ['/api/board', '/api/stream']) {
      for (const authorization of ['', `Bearer ${'x'.repeat(43)}`, test.ingestion]) {
        const response = await fetch(`${test.origin}${path}`, { headers: { authorization } });
        expect(response.status).toBe(401);
        expect(response.headers.get('content-type')).toContain('application/json');
      }
    }
    expect((await test.post('/api/mappings', { sessionId: 'claude:x', projectId: 'project-aaaaaaaaaaaa' }, { authorization: test.ingestion })).status).toBe(401);
    await new Promise((done) => setTimeout(done, 20));
    expect(test.snapshot).not.toHaveBeenCalled();
    const authorization = await test.enroll();
    const board = await fetch(`${test.origin}/api/board`, { headers: { authorization } });
    expect(board.status).toBe(200);
    expect(board.headers.get('cache-control')).toBe('no-store');
    await vi.waitFor(() => expect(test.snapshot).toHaveBeenCalled());
  });

  it('streams a hook as a sequenced event, replays exactly after a disconnect and resets out of window', async () => {
    const test = await start({ capacity: 4 });
    const authorization = await test.enroll();
    const first = await test.open(authorization, '?after=0');
    expect(first.response.headers.get('content-type')).toContain('text/event-stream');
    await vi.waitFor(() => expect(first.frames.some((frame) => frame.event === 'context')).toBe(true));
    expect((await test.hook('live-one')).status).toBe(202);
    await vi.waitFor(() => expect(first.frames.find((frame) => frame.event === 'village' && frame.data.sessionId === 'claude:live-one')).toBeDefined());
    const delivered = first.frames.filter((frame) => frame.event === 'village');
    const lastId = delivered.at(-1)!.id!;
    expect(JSON.stringify(delivered)).not.toContain('private prompt');
    await first.cancel();
    expect((await test.hook('missed-a')).status).toBe(202);
    expect((await test.hook('missed-b')).status).toBe(202);
    const resumed = await test.open(authorization, '', lastId);
    await vi.waitFor(() => expect(resumed.frames.some((frame) => frame.event === 'context')).toBe(true));
    const replayed = resumed.frames.filter((frame) => frame.event === 'village');
    expect(replayed.map((frame) => Number(frame.id))).toEqual([Number(lastId) + 1, Number(lastId) + 2]);
    expect(replayed.map((frame) => frame.data.sessionId)).toEqual(['claude:missed-a', 'claude:missed-b']);
    for (const name of ['c', 'd', 'e', 'f']) await test.hook(`overflow-${name}`);
    const stale = await test.open(authorization, '', lastId);
    await vi.waitFor(() => expect(stale.frames[0]?.event).toBe('reset'));
    const snapshot = stale.frames[0]!.data as BoardSnapshot;
    expect(snapshot.state.sessions['claude:missed-a']).toBeDefined();
    const future = await test.open(authorization, `?after=${snapshot.seq + 10}`);
    await vi.waitFor(() => expect(future.frames[0]?.event).toBe('reset'));
    const otherEpoch = await test.open(authorization, `?after=${snapshot.seq}&epoch=another-journal-epoch`);
    await vi.waitFor(() => expect(otherEpoch.frames[0]?.event).toBe('reset'));
    const current = await test.open(authorization, `?after=${snapshot.seq}&epoch=${snapshot.epoch}`);
    await vi.waitFor(() => expect(current.frames[0]?.event).toBe('context'));
  });

  it('delivers a contiguous sequence with no gap or duplicate while hooks arrive during connection', async () => {
    const test = await start();
    const authorization = await test.enroll();
    const posts = Array.from({ length: 20 }, (_, index) => test.hook(`burst-${index}`));
    const stream = await test.open(authorization, '?after=0');
    await Promise.all(posts);
    await vi.waitFor(() => expect(stream.frames.filter((frame) => frame.event === 'village' && String(frame.data.sessionId).startsWith('claude:burst-'))).toHaveLength(20));
    const ids = stream.frames.filter((frame) => frame.event === 'village').map((frame) => Number(frame.id));
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, index) => ids[0]! + index));
    expect(ids[0]).toBe(1);
  });

  it('sends heartbeats and closes on logout, on session rotation and on expiry', async () => {
    const clock = { now: Date.now() };
    const test = await start({ clock });
    const authorization = await test.enroll();
    const beating = await test.open(authorization);
    await vi.waitFor(() => expect(beating.frames.some((frame) => frame.event === 'heartbeat')).toBe(true));
    expect((await test.post('/api/auth/logout', {}, { authorization })).status).toBe(200);
    await vi.waitFor(() => expect(beating.ended()).toBe(true));
    expect(beating.frames.at(-1)?.event).toBe('expired');

    const rotated = (test.ownerAuth as unknown as { session(): { token: string } }).session();
    const stream = await test.open(`Bearer ${rotated.token}`);
    await vi.waitFor(() => expect(stream.frames.length).toBeGreaterThan(0));
    (test.ownerAuth as unknown as { session(): unknown }).session(); // A new login revokes the previous session.
    await vi.waitFor(() => expect(stream.ended()).toBe(true));

    const latest = (test.ownerAuth as unknown as { session(): { token: string } }).session();
    const expiring = await test.open(`Bearer ${latest.token}`);
    await vi.waitFor(() => expect(expiring.frames.length).toBeGreaterThan(0));
    clock.now += 31 * 60_000;
    await vi.waitFor(() => expect(expiring.ended()).toBe(true));
    expect(expiring.frames.at(-1)?.event).toBe('expired');
    expect((await fetch(`${test.origin}/api/board`, { headers: { authorization: `Bearer ${latest.token}` } })).status).toBe(401);
  });

  it('closes an open stream when the owner configuration disappears, not only on expiry', async () => {
    const test = await start();
    const authorization = await test.enroll();
    const stream = await test.open(authorization);
    await vi.waitFor(() => expect(stream.frames.some((frame) => frame.event === 'heartbeat')).toBe(true));
    unlinkSync(join(test.directory, 'owner.json'));
    await vi.waitFor(() => expect(stream.ended()).toBe(true));
    expect(stream.frames.at(-1)?.event).toBe('expired');
  });

  it('merges a producer retry with the same delivery identity and keeps a new identity distinct', async () => {
    const test = await start();
    const send = (id: string) => test.post('/api/hooks/claude', { session_id: 'retry', hook_event_name: 'Stop', cwd: '/test/orchard' },
      { authorization: test.ingestion, 'x-village-event-id': id, 'x-village-occurred-at': '2026-10-01T10:00:00Z' });
    expect((await send('aaaaaaaa-0000-4000-8000-000000000001')).status).toBe(202);
    await new Promise((done) => setTimeout(done, 1_100));
    expect((await send('aaaaaaaa-0000-4000-8000-000000000001')).status).toBe(202);
    expect((await send('aaaaaaaa-0000-4000-8000-000000000002')).status).toBe(202);
    const authorization = await test.enroll();
    const board = await fetch(`${test.origin}/api/board`, { headers: { authorization } }).then((r) => r.json()) as BoardSnapshot;
    expect(board.seq).toBe(2);
    expect(board.state.sessions['claude:retry']).toMatchObject({ stateAt: '2026-10-01T10:00:00.000Z' });
  });

  it('never reopens the journal after shutdown, and answers hooks with 503', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'village-board-stop-')); dirs.push(directory);
    prepareOwnerSetup(directory);
    const hooks = new HookActivityStore();
    const board = new NativeBoard({ directory, ownerAuth: { hasActiveSession: () => true }, hooks });
    expect(hooks.ingestClaude({ session_id: 'before', hook_event_name: 'Stop', cwd: '/test/orchard' })).toBe(true);
    board.stop();
    rmSync(join(directory, 'journal'), { recursive: true, force: true });
    expect(() => hooks.ingestClaude({ session_id: 'after', hook_event_name: 'Stop', cwd: '/test/orchard' })).not.toThrow(); // Observer removed on stop.
    board.activate();
    expect(existsSync(join(directory, 'journal'))).toBe(false);
    expect(() => board.journal.append({ key: 'late', kind: 'session.signal', source: 'claude-hook', provenance: 'observed', sessionId: 'claude:late', occurredAt: '2026-10-01T10:00:00.000Z',
      data: { tool: 'claude', role: 'lead', state: 'waiting', hookEvent: 'Stop' } })).toThrow('journal_closed');
    expect(existsSync(join(directory, 'journal'))).toBe(false);
  });

  it('re-verifies YAML evidence on every refresh without a file edit, one refresh at a time', async () => {
    let verified = false;
    let running = 0; let overlap = false; let calls = 0;
    const board = new YamlBoard({ villagePath: resolve('fixtures/village.demo.yaml'), mode: 'truth-only', intervalMs: 3_600_000,
      verify: async (workspace) => {
        calls++; running++; if (running > 1) overlap = true;
        await new Promise((done) => setTimeout(done, 5));
        running--;
        const ids = workspace.projects.flatMap((project) => [...project.features.flatMap((feature) => feature.tasks), ...project.tasks]).map((task) => task.id);
        return Object.fromEntries(ids.map((id) => [id, [verified ? 'verified' : 'invalid']])) as Record<string, ('verified' | 'invalid')[]>;
      } });
    try {
      await board.ready;
      const before = Object.values(board.snapshot().state.tasks).filter((task) => task.verifiedReview).length;
      verified = true;
      await Promise.all([board.refresh(), board.refresh(), board.refresh()]);
      await vi.waitFor(() => expect(Object.values(board.snapshot().state.tasks).filter((task) => task.verifiedReview).length).toBeGreaterThan(before));
      expect(overlap).toBe(false);
      expect(calls).toBeLessThanOrEqual(3);
    } finally { board.stop(); }
  });

  it('attaches an unmatched hook identity only through an explicit owner mapping', async () => {
    const test = await start();
    const authorization = await test.enroll();
    await fetch(`${test.origin}/api/board`, { headers: { authorization } });
    const known = projectId('fictional-root');
    await vi.waitFor(async () => {
      const board = await fetch(`${test.origin}/api/board`, { headers: { authorization } }).then((r) => r.json()) as BoardSnapshot;
      expect(board.state.projects[known]).toBeDefined();
    });
    expect((await test.hook('orphan')).status).toBe(202);
    expect((await test.post('/api/mappings', { sessionId: 'claude:orphan', projectId: known }, { authorization, origin: 'https://evil.example' })).status).toBe(403);
    expect((await test.post('/api/mappings', { sessionId: 'claude:orphan', projectId: 'project-000000000000' }, { authorization })).status).toBe(404);
    expect((await test.post('/api/mappings', { sessionId: 'codex:fictional', projectId: known }, { authorization })).status).toBe(409);
    expect((await test.post('/api/mappings', { sessionId: 'claude:orphan', projectId: known, extra: true }, { authorization })).status).toBe(422);
    expect((await test.post('/api/mappings', { sessionId: 'claude:orphan', projectId: known }, { authorization })).status).toBe(200);
    const board = await fetch(`${test.origin}/api/board`, { headers: { authorization } }).then((r) => r.json()) as BoardSnapshot;
    expect(board.state.mappings['claude:orphan']).toMatchObject({ projectId: known });
  });

  it('treats a VILLAGE_PROJECT_ALIASES session entry as an explicit owner mapping for a hook identity', async () => {
    const test = await start({ aliases: { 'session:claude:aliased': 'Orchard alias' } });
    expect((await test.hook('aliased')).status).toBe(202);
    expect((await test.hook('not-aliased')).status).toBe(202);
    const authorization = await test.enroll();
    const board = await fetch(`${test.origin}/api/board`, { headers: { authorization } }).then((r) => r.json()) as BoardSnapshot;
    expect(board.state.mappings['claude:aliased']).toMatchObject({ projectId: projectId('alias:Orchard alias'), projectName: 'Orchard alias' });
    expect(board.state.mappings['claude:not-aliased']).toBeUndefined();
  });

  it('pushes a saved ledger plan to open streams immediately as an event and a context update', async () => {
    const test = await start();
    const authorization = await test.enroll();
    const stream = await test.open(authorization, '?after=0');
    const known = projectId('fictional-root');
    await vi.waitFor(() => expect(stream.frames.some((frame) => frame.event === 'village' && frame.data.projectId === known)).toBe(true));
    const plan = { objective: 'A fictional stable goal', milestones: [{ id: 'first', title: 'First', validated: true, note: 'Checked by hand' }] };
    const saved = await test.post('/api/plan', { projectId: known, revision: 0, plan }, { authorization });
    expect(saved.status).toBe(200);
    await vi.waitFor(() => expect(stream.frames.some((frame) => frame.event === 'village' && frame.data.kind === 'plan.saved')).toBe(true));
    await vi.waitFor(() => expect(stream.frames.filter((frame) => frame.event === 'context').at(-1)?.data.plans[known]?.objective).toBe('A fictional stable goal'));
  });

  it('serves the fictional board in demo mode without a stream', async () => {
    const server = createVillageServer({ mode: 'demo', villagePath: resolve('fixtures/village.demo.yaml'), distDir: resolve('dist') });
    servers.push(server); await listenLocal(server, 0);
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const board = await fetch(`${origin}/api/board`).then((r) => r.json()) as BoardSnapshot;
    expect(board).toMatchObject({ fictional: true, mode: 'demo', capabilities: { stream: false } });
    expect(Object.keys(board.state.projects)).toHaveLength(6);
    expect((await fetch(`${origin}/api/stream`)).status).toBe(404);
  });

  it('serves a YAML board in truth-only mode from cached background verification', async () => {
    const server = createVillageServer({ mode: 'truth-only', villagePath: resolve('fixtures/village.demo.yaml'), distDir: resolve('dist') });
    servers.push(server); await listenLocal(server, 0);
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const board = await fetch(`${origin}/api/board`).then((r) => r.json()) as BoardSnapshot;
    expect(board).toMatchObject({ fictional: false, mode: 'truth-only' });
    expect(Object.values(board.state.tasks).length).toBeGreaterThan(5);
    expect(Object.keys(board.state.sessions)).toHaveLength(0);
  });
});

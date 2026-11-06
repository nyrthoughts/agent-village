import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVillageServer, listenLocal } from './index.js';
import { HookActivityStore } from './activity/hookStore.js';
import { NativeActivityHub } from './activity/nativeActivity.js';
import type { RouterOptions } from './router.js';
import { OwnerAuth } from './auth/ownerAuth.js';
import { prepareOwnerSetup } from './auth/privateState.js';
import type { BoardSnapshot } from '../shared/board.js';

const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); })));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function start(overrides: Partial<RouterOptions> = {}) {
  const distDir = mkdtempSync(join(tmpdir(), 'agent-village-activity-dist-'));
  directories.push(distDir);
  mkdirSync(join(distDir, 'assets'));
  writeFileSync(join(distDir, 'index.html'), '<main>Board</main>', 'utf8');
  const server = createVillageServer({ villagePath: resolve('fixtures/village.demo.yaml'), distDir, ...overrides });
  servers.push(server);
  await listenLocal(server, 0);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function hookAuth() {
  const directory = mkdtempSync(join(tmpdir(), 'village-hook-auth-test-'));
  directories.push(directory);
  const paths = prepareOwnerSetup(directory);
  const ownerAuth = new OwnerAuth(directory);
  // This suite covers mode data; the auth suites exercise owner verification.
  vi.spyOn(ownerAuth, 'authorize').mockImplementation(() => undefined);
  const authorization = readFileSync(paths.hookHeaderPath, 'utf8').trim().replace(/^Authorization: /, '');
  return { ownerAuth, authorization };
}

describe('board modes', () => {
  it('serves the fictional six-project board in demo mode, labelled fictional', async () => {
    const origin = await start({ mode: 'demo' });
    const board = await fetch(`${origin}/api/board`).then((response) => response.json()) as BoardSnapshot;
    expect(board.fictional).toBe(true);
    expect(Object.keys(board.state.projects)).toHaveLength(6);
    expect(board.health).toEqual([expect.objectContaining({ kind: 'fixture' })]);
  });

  it('degrades a failed live AMC call to a dated source failure without changing YAML truth', async () => {
    const origin = await start({ mode: 'live', amcEndpoint: 'http://127.0.0.1:1/api/dashboard' });
    const board = await fetch(`${origin}/api/board`).then((response) => response.json()) as BoardSnapshot;
    expect(board.health.find((source) => source.id === 'amc')).toMatchObject({ lastError: expect.any(String), lastErrorAt: expect.any(String) });
    expect(Object.keys(board.state.sessions)).toHaveLength(0);
    expect(Object.values(board.state.tasks).length).toBeGreaterThan(5);
  });

  it('has no activity source in truth-only mode', async () => {
    const origin = await start({ mode: 'truth-only' });
    const board = await fetch(`${origin}/api/board`).then((response) => response.json()) as BoardSnapshot;
    expect(board.health.map((source) => source.id)).toEqual(['yaml']);
    expect(Object.keys(board.state.sessions)).toHaveLength(0);
  });

  it('journals loopback Claude hooks without prompt content and keeps them unmatched', async () => {
    const hooks = new HookActivityStore();
    const nativeActivity = new NativeActivityHub([{ read: async () => hooks.workers() }], undefined, hooks);
    const auth = hookAuth();
    const origin = await start({ mode: 'native', nativeActivity, ownerAuth: auth.ownerAuth, nativeBoard: { watch: false } });
    const hook = await fetch(`${origin}/api/hooks/claude`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth.authorization },
      body: JSON.stringify({ session_id: 'claude-live', hook_event_name: 'UserPromptSubmit', cwd: '/work/atlas', prompt: 'private prompt content' }),
    });
    expect(hook.status).toBe(202);
    const journal = readFileSync(join(auth.ownerAuth.directory, 'journal', 'events.jsonl'), 'utf8');
    expect(journal).toContain('"sessionId":"claude:claude-live"');
    expect(journal).not.toContain('private prompt content');
    expect(journal).not.toContain('/work/atlas');
  });

  it('rejects malformed and oversized native hook requests', async () => {
    const hooks = new HookActivityStore();
    const nativeActivity = new NativeActivityHub([], undefined, hooks);
    const auth = hookAuth();
    const origin = await start({ mode: 'native', nativeActivity, ownerAuth: auth.ownerAuth, nativeBoard: { watch: false } });
    const malformed = await fetch(`${origin}/api/hooks/openclaw`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth.authorization }, body: '{bad json' });
    expect(malformed.status).toBe(400);
    const oversized = await fetch(`${origin}/api/hooks/claude`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth.authorization },
      body: JSON.stringify({ payload: 'x'.repeat(70_000) }) });
    expect(oversized.status).toBe(413);
  });
});

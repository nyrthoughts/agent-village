import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createVillageServer, listenLocal } from './index.js';
import { HookActivityStore } from './activity/hookStore.js';
import { NativeActivityHub } from './activity/nativeActivity.js';
import type { RouterOptions } from './router.js';

const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function start(overrides: Partial<RouterOptions> = {}) {
  const distDir = mkdtempSync(join(tmpdir(), 'agent-village-activity-dist-'));
  directories.push(distDir);
  mkdirSync(join(distDir, 'assets'));
  writeFileSync(join(distDir, 'index.html'), '<main>Village</main>', 'utf8');
  const server = createVillageServer({
    villagePath: resolve('fixtures/village.demo.yaml'),
    distDir,
    ...overrides,
  });
  servers.push(server);
  await listenLocal(server, 0);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('/api/activity modes', () => {
  it('serves the fictional AMC fixture in demo mode', async () => {
    const origin = await start({ mode: 'demo' });
    const response = await fetch(`${origin}/api/activity`);
    const snapshot = await response.json() as { status: string; workers: unknown[] };
    expect(snapshot.status).toBe('demo');
    expect(snapshot.workers).toHaveLength(3);
  });

  it('degrades a failed live AMC call without changing village truth bytes', async () => {
    const origin = await start({
      mode: 'live',
      amcEndpoint: 'http://127.0.0.1:1/api/dashboard',
    });
    const before = await fetch(`${origin}/api/village`).then((response) => response.text());
    const activity = await fetch(`${origin}/api/activity`).then((response) => response.json()) as { status: string };
    const after = await fetch(`${origin}/api/village`).then((response) => response.text());

    expect(activity.status).toBe('degraded');
    expect(after).toBe(before);
  });

  it('returns an absent snapshot in truth-only mode', async () => {
    const origin = await start({ mode: 'truth-only' });
    const snapshot = await fetch(`${origin}/api/activity`).then((response) => response.json()) as { status: string; workers: unknown[] };
    expect(snapshot).toMatchObject({ status: 'absent', workers: [] });
  });

  it('accepts loopback Claude hooks and exposes them through native activity', async () => {
    const now = () => new Date('2026-09-01T12:00:00.000Z');
    const hooks = new HookActivityStore(now);
    const nativeActivity = new NativeActivityHub([
      { read: async () => hooks.workers() },
    ], now, hooks);
    const origin = await start({ mode: 'native', nativeActivity });

    const hook = await fetch(`${origin}/api/hooks/claude`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: 'claude-live',
        hook_event_name: 'UserPromptSubmit',
        cwd: '/work/atlas',
        prompt: 'private prompt content',
      }),
    });
    expect(hook.status).toBe(202);

    const snapshot = await fetch(`${origin}/api/activity`).then((response) => response.json()) as { workers: Array<{ id: string; title?: string }> };
    expect(snapshot.workers).toEqual([
      expect.objectContaining({ id: 'claude:claude-live', title: 'atlas' }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('private prompt content');
  });

  it('rejects malformed and oversized native hook requests', async () => {
    const hooks = new HookActivityStore();
    const nativeActivity = new NativeActivityHub([], undefined, hooks);
    const origin = await start({ mode: 'native', nativeActivity });

    const malformed = await fetch(`${origin}/api/hooks/openclaw`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad json',
    });
    expect(malformed.status).toBe(400);

    const oversized = await fetch(`${origin}/api/hooks/claude`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(70_000) }),
    });
    expect(oversized.status).toBe(413);
  });
});

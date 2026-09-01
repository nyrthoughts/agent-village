import { describe, expect, it } from 'vitest';
import {
  CodexAppServerProvider,
  mapCodexThreads,
  type AppServerTransport,
  type CodexThreadRecord,
} from './codexProvider.js';

const now = new Date('2026-09-01T12:00:00.000Z');

function thread(overrides: Partial<CodexThreadRecord> = {}): CodexThreadRecord {
  return {
    id: 'thread-1',
    cwd: '/work/atlas',
    name: 'Build Atlas bridge',
    preview: 'Build Atlas bridge',
    updatedAt: now.getTime() / 1000,
    status: { type: 'active', activeFlags: [] },
    ...overrides,
  };
}

describe('mapCodexThreads', () => {
  it('maps active Codex threads to working and waiting workers', () => {
    const workers = mapCodexThreads([
      thread(),
      thread({ id: 'thread-2', status: { type: 'active', activeFlags: ['waitingOnUserInput'] } }),
    ], now);

    expect(workers).toEqual([
      expect.objectContaining({ id: 'codex:thread-1', tool: 'codex', state: 'working', project: 'atlas', title: 'Build Atlas bridge' }),
      expect.objectContaining({ id: 'codex:thread-2', tool: 'codex', state: 'waiting' }),
    ]);
  });

  it('keeps recent idle threads and drops stale ones', () => {
    const workers = mapCodexThreads([
      thread({ id: 'just-active', status: { type: 'idle' }, updatedAt: now.getTime() / 1000 - 10 }),
      thread({ id: 'recent', status: { type: 'idle' }, updatedAt: now.getTime() / 1000 - 10 * 60 }),
      thread({ id: 'stale', status: { type: 'idle' }, updatedAt: now.getTime() / 1000 - 31 * 60 }),
    ], now, 30);

    expect(workers.map(({ id }) => id)).toEqual(['codex:just-active', 'codex:recent']);
    expect(workers[0]?.state).toBe('working');
    expect(workers[1]?.state).toBe('idle');
  });

  it('uses a safe project label when no thread title exists', () => {
    const workers = mapCodexThreads([
      thread({ name: null, preview: '', cwd: '/work/beacon' }),
    ], now);

    expect(workers[0]?.title).toBe('beacon');
  });

  it('uses the read-only app-server thread API and caches rapid polls', async () => {
    const calls: string[] = [];
    const transport: AppServerTransport = {
      async request(method) {
        calls.push(method);
        if (method === 'initialize') return { userAgent: 'Codex' };
        return { data: [thread()] };
      },
      notify(method) { calls.push(method); },
      async close() { calls.push('close'); },
    };
    let transports = 0;
    const provider = new CodexAppServerProvider({
      now: () => now,
      createTransport: async () => { transports += 1; return transport; },
    });

    await expect(provider.read()).resolves.toEqual([
      expect.objectContaining({ id: 'codex:thread-1', state: 'working' }),
    ]);
    await provider.read();

    expect(transports).toBe(1);
    expect(calls).toEqual(['initialize', 'initialized', 'thread/list', 'close']);
  });
});

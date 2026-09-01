import { describe, expect, it } from 'vitest';
import type { Worker } from '../../shared/activity.js';
import { NativeActivityHub, type WorkerProvider } from './nativeActivity.js';

const worker = (id: string, title: string): Worker => ({
  id,
  title,
  tool: id.startsWith('codex') ? 'codex' : 'claude',
  state: 'working',
  lastActivityAt: '2026-09-01T12:00:00.000Z',
});

describe('NativeActivityHub', () => {
  it('aggregates providers, attaches title mappings and isolates failures', async () => {
    const providers: WorkerProvider[] = [
      { read: async () => [worker('codex:1', 'Atlas bridge')] },
      { read: async () => { throw new Error('provider down'); } },
      { read: async () => [worker('claude:1', 'Beacon relay')] },
    ];
    const hub = new NativeActivityHub(providers, () => new Date('2026-09-01T12:00:00.000Z'));
    const snapshot = await hub.snapshot([
      { match: 'atlas bridge', taskId: 'atlas-bridge' },
      { match: 'beacon relay', taskId: 'beacon-relay' },
    ]);

    expect(snapshot.status).toBe('live');
    expect(snapshot.workers).toEqual([
      expect.objectContaining({ id: 'codex:1', attachedTaskId: 'atlas-bridge' }),
      expect.objectContaining({ id: 'claude:1', attachedTaskId: 'beacon-relay' }),
    ]);
  });
});

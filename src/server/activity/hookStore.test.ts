import { describe, expect, it } from 'vitest';
import { HookActivityStore } from './hookStore.js';

describe('HookActivityStore', () => {
  it('tracks Claude lifecycle events without retaining prompt content', () => {
    let now = new Date('2026-09-01T12:00:00.000Z');
    const store = new HookActivityStore(() => now);

    expect(store.ingestClaude({
      session_id: 'claude-1',
      hook_event_name: 'SessionStart',
      cwd: '/work/atlas',
    })).toBe(true);
    store.ingestClaude({
      session_id: 'claude-1',
      hook_event_name: 'UserPromptSubmit',
      cwd: '/work/atlas',
      prompt: 'secret customer data that must not be stored',
    });
    expect(store.workers()).toEqual([
      expect.objectContaining({ id: 'claude:claude-1', tool: 'claude', state: 'working', project: 'atlas', title: 'atlas' }),
    ]);

    now = new Date('2026-09-01T12:01:00.000Z');
    store.ingestClaude({ session_id: 'claude-1', hook_event_name: 'Stop', cwd: '/work/atlas' });
    expect(store.workers()[0]?.state).toBe('waiting');
  });

  it('accepts normalized OpenClaw events and expires ended sessions', () => {
    let now = new Date('2026-09-01T12:00:00.000Z');
    const store = new HookActivityStore(() => now, 30);
    expect(store.ingestOpenClaw({ sessionId: 'claw-1', event: 'session_start', title: 'Beacon relay' })).toBe(true);
    expect(store.workers()[0]).toMatchObject({ tool: 'openclaw', state: 'working', title: 'Beacon relay' });

    store.ingestOpenClaw({ sessionId: 'claw-1', event: 'session_end', title: 'Beacon relay' });
    now = new Date('2026-09-01T12:31:00.000Z');
    expect(store.workers()).toEqual([]);
  });

  it('rejects malformed hook payloads', () => {
    const store = new HookActivityStore();
    expect(store.ingestClaude({ session_id: '../bad', hook_event_name: 'Stop', cwd: '/tmp' })).toBe(false);
    expect(store.ingestOpenClaw({ sessionId: '', event: 'agent_end' })).toBe(false);
  });
});

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
      expect.objectContaining({ id: 'claude:claude-1', tool: 'claude', role: 'lead', state: 'working', project: 'atlas', title: 'atlas' }),
    ]);

    now = new Date('2026-09-01T12:01:00.000Z');
    store.ingestClaude({ session_id: 'claude-1', hook_event_name: 'Stop', cwd: '/work/atlas' });
    expect(store.workers()[0]?.state).toBe('waiting');
  });

  it('tracks Claude helpers beside their lead without overwriting the session', () => {
    const store = new HookActivityStore(() => new Date('2026-09-01T12:00:00.000Z'));
    store.ingestClaude({ session_id: 'claude-1', hook_event_name: 'SessionStart', cwd: '/work/atlas' });
    store.ingestClaude({ session_id: 'claude-1', hook_event_name: 'SubagentStart', agent_id: 'reviewer-1', agent_type: 'reviewer', cwd: '/work/atlas' });

    expect(store.workers()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'claude:claude-1', role: 'lead' }),
      expect.objectContaining({ id: 'claude:claude-1:helper:reviewer-1', role: 'helper', parentId: 'claude:claude-1', title: 'reviewer' }),
    ]));

    store.ingestClaude({ session_id: 'claude-1', hook_event_name: 'SubagentStop', agent_id: 'reviewer-1', cwd: '/work/atlas' });
    expect(store.workers().map(({ id }) => id)).toEqual(['claude:claude-1']);
  });

  it('accepts normalized OpenClaw events and expires ended sessions', () => {
    let now = new Date('2026-09-01T12:00:00.000Z');
    const store = new HookActivityStore(() => now, 30);
    expect(store.ingestOpenClaw({ sessionId: 'claw-1', event: 'session_start', title: 'Beacon relay' })).toBe(true);
    expect(store.workers()[0]).toMatchObject({ tool: 'openclaw', role: 'unknown', state: 'working', title: 'Beacon relay' });

    store.ingestOpenClaw({ sessionId: 'claw-1', event: 'session_end', title: 'Beacon relay' });
    now = new Date('2026-09-01T12:31:00.000Z');
    expect(store.workers()).toEqual([]);
  });

  it('rejects malformed hook payloads', () => {
    const store = new HookActivityStore();
    expect(store.ingestClaude({ session_id: '../bad', hook_event_name: 'Stop', cwd: '/tmp' })).toBe(false);
    expect(store.ingestOpenClaw({ sessionId: '', event: 'agent_end' })).toBe(false);
    expect(store.ingestClaude({ session_id: 'fake', hook_event_name: 'ExecuteAnything', cwd: '/tmp' })).toBe(false);
    expect(store.workers()).toEqual([]);
  });

  it('evicts the least recent observation and expires entries on ingestion', () => {
    let now = new Date('2026-09-01T12:00:00Z');
    const store = new HookActivityStore(() => now, 30, 2);
    for (const sessionId of ['one', 'two', 'three']) {
      store.ingestOpenClaw({ sessionId, event: 'session_start' });
      now = new Date(now.getTime() + 1000);
    }
    expect(store.workers().map((worker) => worker.id)).toEqual(['openclaw:two', 'openclaw:three']);
    now = new Date('2026-09-01T12:31:00Z');
    store.ingestOpenClaw({ sessionId: 'four', event: 'session_start' });
    expect(store.workers().map((worker) => worker.id)).toEqual(['openclaw:four']);
  });
});

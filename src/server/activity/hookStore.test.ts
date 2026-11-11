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
      expect.objectContaining({ id: 'claude:claude-1', tool: 'claude', role: 'lead', state: 'working', project: 'atlas', title: 'atlas',
        activityEvidence: { level: 'recent', source: 'claude-hook', observedAt: '2026-09-01T12:00:00.000Z' } }),
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

  it('records approval and input requests from typed notifications only, without their message, until later activity', () => {
    let now = new Date('2026-09-01T12:00:00.000Z');
    const store = new HookActivityStore(() => now);
    const lead = () => store.workers().find((worker) => worker.id === 'claude:s1');
    const send = (hook_event_name: string, extra: object = {}) => store.ingestClaude({ session_id: 's1', hook_event_name, cwd: '/work/atlas', ...extra });
    expect(send('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use SECRET_TOOL' })).toBe(true);
    expect(lead()).toMatchObject({ state: 'waiting', attention: { kind: 'approval', at: '2026-09-01T12:00:00.000Z', source: 'claude-hook' } });
    expect(JSON.stringify(store.workers())).not.toMatch(/SECRET_TOOL|permission_prompt|message/);
    now = new Date('2026-09-01T12:00:10.000Z');
    send('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'SECRET_COMMAND' } });
    expect(lead()?.attention).toBeUndefined();
    expect(JSON.stringify(store.workers())).not.toContain('SECRET_COMMAND');

    for (const [type, kind] of [['idle_prompt', 'input'], ['elicitation_dialog', 'input']] as const) {
      send('Notification', { notification_type: type });
      expect(lead()?.attention?.kind).toBe(kind);
      send('UserPromptSubmit', { prompt: 'answer' });
      expect(lead()?.attention).toBeUndefined();
    }
    send('PermissionRequest', { tool_name: 'Edit' });
    expect(lead()?.attention?.kind).toBe('approval');
    // A notification without a known type and a helper starting leave the request pending.
    send('Notification', { notification_type: 'auth_success' });
    send('Notification');
    send('SubagentStart', { agent_id: 'h1', agent_type: 'reviewer' });
    expect(lead()?.attention?.kind).toBe('approval');
    expect(store.workers().find((worker) => worker.role === 'helper')?.attention).toBeUndefined();
    for (const event of ['PostToolUse', 'Stop']) {
      send('PermissionRequest');
      send(event);
      expect(lead()?.attention).toBeUndefined();
    }
  });

  it('marks a failed turn only from StopFailure and clears it on a new prompt', () => {
    const now = new Date('2026-09-01T12:00:00.000Z');
    const store = new HookActivityStore(() => now);
    const event = { session_id: 's1', cwd: '/work/atlas' };
    store.ingestClaude({ ...event, hook_event_name: 'PostToolUseFailure' });
    expect(store.workers()[0]?.failure).toBeUndefined();
    store.ingestClaude({ ...event, hook_event_name: 'StopFailure', error: 'PRIVATE_ERROR_TEXT' });
    expect(store.workers()[0]?.failure).toEqual({ at: now.toISOString(), source: 'claude-hook' });
    expect(JSON.stringify(store.workers())).not.toContain('PRIVATE_ERROR_TEXT');
    store.ingestClaude({ ...event, hook_event_name: 'UserPromptSubmit' });
    expect(store.workers()[0]?.failure).toBeUndefined();
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

  it('does not keep stale lifecycle events looking like confirmed ongoing work', () => {
    let now = new Date('2026-09-01T12:00:00Z');
    const store = new HookActivityStore(() => now);
    store.ingestClaude({ session_id: 'lead', hook_event_name: 'SubagentStart', agent_id: 'helper', cwd: '/repo' });
    store.ingestOpenClaw({ sessionId: 'claw', event: 'agent_start' });
    expect(store.workers().every((worker) => worker.activityEvidence?.level === 'recent')).toBe(true);
    now = new Date('2026-09-01T12:02:01Z');
    expect(store.workers()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'claude:lead:helper:helper', state: 'unknown',
        activityEvidence: { level: 'detected', source: 'claude-hook', observedAt: '2026-09-01T12:00:00.000Z' } }),
      expect.objectContaining({ id: 'openclaw:claw', state: 'unknown',
        activityEvidence: { level: 'detected', source: 'openclaw-hook', observedAt: '2026-09-01T12:00:00.000Z' } }),
    ]));
  });
});

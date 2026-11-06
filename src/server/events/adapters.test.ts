import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ObservedSession } from '../../shared/observation.js';
import { HookActivityStore, type HookObservation } from '../activity/hookStore.js';
import { projectId } from '../activity/projectObserver.js';
import { hookEvent, snapshotEvents } from './adapters.js';
import { EventJournal } from './journal.js';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function journal() {
  const directory = mkdtempSync(join(tmpdir(), 'agent-village-adapter-test-'));
  directories.push(directory);
  return { journal: new EventJournal({ directory: join(directory, 'journal') }), path: join(directory, 'journal', 'events.jsonl') };
}

const session = (overrides: Partial<ObservedSession> = {}): ObservedSession => ({
  id: 'codex:fictional-1', tool: 'codex', role: 'lead', state: 'waiting', projectKey: '/work/orchard', project: 'Orchard', title: 'Orchard task',
  lastActivityAt: '2026-10-01T10:00:00.000Z', activityEvidence: { level: 'detected', source: 'codex-journal', observedAt: '2026-10-01T10:00:00.000Z' },
  history: [{ at: '2026-10-01T09:59:00.000Z', kind: 'request', text: 'Add the orchard map.' }, { at: '2026-10-01T10:00:00.000Z', kind: 'report', text: '## Done\n- Orchard map added.' }],
  ...overrides,
});

describe('hook adapter', () => {
  it('turns accepted hooks into allowlisted events with one key per delivery second', () => {
    const now = { value: new Date('2026-10-01T10:00:00.200Z') };
    const store = new HookActivityStore(() => now.value);
    const observations: HookObservation[] = [];
    store.observe((observation) => observations.push(observation));
    const payload = { session_id: 'fictional', hook_event_name: 'PostToolUse', cwd: '/work/orchard', tool_use_id: 'toolu_1',
      tool_input: { command: 'cat secret' }, tool_response: { stdout: 'private output' }, prompt: 'private prompt content' };
    expect(store.ingestClaude(payload)).toBe(true);
    now.value = new Date('2026-10-01T10:00:00.700Z');
    expect(store.ingestClaude(payload)).toBe(true);
    const [first, retry] = observations.map(hookEvent);
    expect(first!.key).toBe(retry!.key);
    expect(first).toMatchObject({ kind: 'session.signal', sessionId: 'claude:fictional', data: { hint: 'orchard', hookEvent: 'PostToolUse', state: 'working' } });
    expect(JSON.stringify(first)).not.toMatch(/private|secret|toolu_1|\/work/);
    expect(first!.projectId).toBeUndefined();
  });

  it('keeps one source identity for a tool call retransmitted across seconds and a restart', () => {
    const { journal: first } = journal();
    const directory = first.directory;
    const now = { value: new Date('2026-10-01T10:00:00.200Z') };
    const store = new HookActivityStore(() => now.value);
    let target = first;
    store.observe((observation) => target.append(hookEvent(observation)));
    const payload = { session_id: 'fictional', hook_event_name: 'PostToolUse', cwd: '/work/orchard', tool_use_id: 'toolu_retry' };
    store.ingestClaude(payload);
    now.value = new Date('2026-10-01T10:00:01.300Z');
    store.ingestClaude(payload);
    first.close();
    target = new EventJournal({ directory });
    now.value = new Date('2026-10-01T10:00:05.000Z');
    store.ingestClaude(payload);
    expect(target.seq).toBe(1);
    // A different tool call of the same session is a new event.
    store.ingestClaude({ ...payload, tool_use_id: 'toolu_next' });
    expect(target.seq).toBe(2);
    target.close();
  });

  it('uses a producer event identity and time when supplied, and keeps legacy hooks honest', () => {
    const now = { value: new Date('2026-10-01T10:00:00.200Z') };
    const store = new HookActivityStore(() => now.value);
    const keys: { key: string; occurredAt: string }[] = [];
    store.observe((observation) => { const event = hookEvent(observation); keys.push({ key: event.key, occurredAt: event.occurredAt }); });
    const stop = { session_id: 'fictional', hook_event_name: 'Stop', cwd: '/work/orchard' };
    store.ingestClaude(stop, { eventId: 'b5f0a2d4-1111-4c3e-9e55-000000000001', occurredAt: '2026-10-01T09:59:59Z' });
    now.value = new Date('2026-10-01T10:00:03.000Z');
    store.ingestClaude(stop, { eventId: 'b5f0a2d4-1111-4c3e-9e55-000000000001', occurredAt: '2026-10-01T09:59:59Z' });
    expect(keys[0]!.key).toBe(keys[1]!.key);
    expect(keys[0]!.occurredAt).toBe('2026-10-01T09:59:59.000Z');
    // Legacy metadata-only hooks: merged only within one receiving second, a stated limit.
    store.ingestClaude(stop);
    now.value = new Date('2026-10-01T10:00:03.400Z');
    store.ingestClaude(stop);
    now.value = new Date('2026-10-01T10:00:04.100Z');
    store.ingestClaude(stop);
    expect(keys[2]!.key).toBe(keys[3]!.key);
    expect(keys[4]!.key).not.toBe(keys[3]!.key);
    // A resumed session produces new lifecycle events; a future producer time is ignored.
    store.ingestClaude({ ...stop, hook_event_name: 'SessionStart' }, { eventId: 'b5f0a2d4-1111-4c3e-9e55-000000000002', occurredAt: '2026-10-02T10:00:00Z' });
    expect(keys[5]!.key).not.toBe(keys[0]!.key);
    expect(keys[5]!.occurredAt).toBe('2026-10-01T10:00:04.100Z');
    // OpenClaw body identity.
    store.ingestOpenClaw({ sessionId: 'claw', event: 'agent_end', eventId: 'c6a1b3e5-2222-4d4f-8f66-000000000003', occurredAt: '2026-10-01T10:00:04Z' });
    now.value = new Date('2026-10-01T10:00:09.000Z');
    store.ingestOpenClaw({ sessionId: 'claw', event: 'agent_end', eventId: 'c6a1b3e5-2222-4d4f-8f66-000000000003', occurredAt: '2026-10-01T10:00:04Z' });
    expect(keys[6]!.key).toBe(keys[7]!.key);
  });

  it('persists the hook once in the journal without raw extras', () => {
    const { journal: events, path } = journal();
    const store = new HookActivityStore(() => new Date());
    store.observe((observation) => events.append(hookEvent(observation)));
    const payload = { session_id: 'helper-parent', hook_event_name: 'SubagentStart', agent_id: 'helper-1', agent_type: 'reviewer', cwd: '/work/orchard', transcript_path: '/private/t.jsonl' };
    for (let attempt = 0; attempt < 3; attempt++) store.ingestClaude(payload);
    expect(events.seq).toBe(1);
    expect(events.state.sessions['claude:helper-parent:helper:helper-1']).toMatchObject({ role: 'helper', parentId: 'claude:helper-parent', native: false });
    expect(readFileSync(path, 'utf8')).not.toMatch(/transcript_path|private\/t\.jsonl|\/work\//);
    events.close();
  });
});

describe('native snapshot adapter', () => {
  it('emits only changes relative to the projection and nothing on an unchanged re-read', () => {
    const { journal: events } = journal();
    const first = snapshotEvents([session()], events.state);
    expect(first.map((event) => event.kind)).toEqual(['session.observed', 'session.update', 'session.update']);
    expect(first[0]).toMatchObject({ projectId: projectId('/work/orchard'), provenance: 'observed' });
    expect(first[2]).toMatchObject({ provenance: 'declared', data: { kind: 'report' } });
    events.appendMany(first);
    expect(snapshotEvents([session()], events.state)).toEqual([]);
    const changed = snapshotEvents([session({ history: [...session().history, { at: '2026-10-01T10:05:00.000Z', kind: 'report', text: 'Second report.' }],
      lastActivityAt: '2026-10-01T10:05:00.000Z', activityEvidence: { level: 'recent', source: 'codex-journal', observedAt: '2026-10-01T10:05:00.000Z' } })], events.state);
    expect(changed.map((event) => event.kind)).toEqual(['session.observed', 'session.update']);
    events.close();
  });

  it('never emits hook-only provisional identities from a merged snapshot', () => {
    const { journal: events } = journal();
    expect(snapshotEvents([session({ id: 'claude:hook', projectKey: 'hook:claude:hook' })], events.state)).toEqual([]);
    events.close();
  });
});

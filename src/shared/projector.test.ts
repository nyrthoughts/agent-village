import { describe, expect, it } from 'vitest';
import { emptyState, LIMITS, reduce, reduceAll, sessionProject } from './projector.js';
import { ci, observed, sequence, signal, update } from './testEvents.js';
import type { VillageEvent } from './events.js';

const repo = 'fictional/orchard';

describe('pure projector', () => {
  it('keeps the newest CI fact for a SHA: a late pending never overwrites success', () => {
    const [success, latePending] = sequence([ci(repo, 'abc1234', '2026-10-01T10:05:00Z', 'success'), ci(repo, 'abc1234', '2026-10-01T10:00:00Z', 'pending')]);
    const afterSuccess = reduce(emptyState(), success!);
    const afterLate = reduce(afterSuccess, latePending!);
    expect(afterLate).toBe(afterSuccess);
    expect(afterLate.facts[`ci:${repo}:abc1234`]).toMatchObject({ data: { status: 'success' }, occurredAt: '2026-10-01T10:05:00Z' });
  });

  it('is order independent for entity state', () => {
    const events = sequence([
      signal('claude:a', '2026-10-01T10:00:00.000Z', 'working'),
      signal('claude:a', '2026-10-01T10:02:00.000Z', 'waiting'),
      ci(repo, 'abc1234', '2026-10-01T10:01:00Z', 'pending'),
      ci(repo, 'abc1234', '2026-10-01T10:03:00Z', 'failure'),
    ]);
    const forward = reduceAll(events);
    const backward = reduceAll([...events].reverse());
    expect(forward.sessions['claude:a']!.state).toBe('waiting');
    expect(backward.sessions['claude:a']!.state).toBe('waiting');
    expect(backward.facts[`ci:${repo}:abc1234`]!.data).toMatchObject({ status: 'failure' });
  });

  it('accepts a changed fact with the same timestamp and ignores an identical one', () => {
    const [first, same, changed] = sequence([
      observed('codex:a', 'project-aaaaaaaaaaaa', '2026-10-01T10:00:00.000Z', { state: 'working', level: 'recent' }),
      observed('codex:a', 'project-aaaaaaaaaaaa', '2026-10-01T10:00:00.000Z', { state: 'working', level: 'recent' }),
      observed('codex:a', 'project-aaaaaaaaaaaa', '2026-10-01T10:00:00.000Z', { state: 'idle', level: 'detected' }),
    ]);
    const one = reduce(emptyState(), first!);
    expect(reduce(one, same!)).toBe(one);
    expect(reduce(one, changed!).sessions['codex:a']!.state).toBe('idle');
  });

  it('applies a late native identity without rolling back a newer hook state', () => {
    const [hook, native] = sequence([
      signal('claude:b', '2026-10-01T10:05:00.000Z', 'waiting', { hint: 'orchard' }),
      observed('claude:b', 'project-bbbbbbbbbbbb', '2026-10-01T10:00:00.000Z', { tool: 'claude', state: 'working', projectName: 'Orchard' }),
    ]);
    const hookOnly = reduce(emptyState(), hook!);
    expect(sessionProject(hookOnly, 'claude:b')).toBeUndefined();
    const merged = reduce(hookOnly, native!);
    expect(merged.sessions['claude:b']).toMatchObject({ native: true, projectId: 'project-bbbbbbbbbbbb', state: 'waiting', stateSource: 'claude-hook' });
    expect(sessionProject(merged, 'claude:b')).toBe('project-bbbbbbbbbbbb');
  });

  it('never matches an unknown hook identity by name; only owner mappings or a parent identity attach it', () => {
    const events = sequence([
      observed('codex:native', 'project-cccccccccccc', '2026-10-01T09:00:00.000Z', { projectName: 'orchard' }),
      signal('claude:unknown', '2026-10-01T10:00:00.000Z', 'working', { hint: 'orchard', title: 'orchard' }),
      signal('claude:unknown:helper:x', '2026-10-01T10:00:01.000Z', 'working', { role: 'helper', parentId: 'claude:unknown' }),
    ]);
    const state = reduceAll(events);
    expect(sessionProject(state, 'claude:unknown')).toBeUndefined();
    expect(sessionProject(state, 'claude:unknown:helper:x')).toBeUndefined();
    const mapped = reduce(state, { key: 'map-1', kind: 'identity.mapped', source: 'owner', provenance: 'verified', occurredAt: '2026-10-01T10:01:00.000Z',
      data: { sessionId: 'claude:unknown', projectId: 'project-cccccccccccc', projectName: 'orchard' }, seq: 4, receivedAt: '2026-10-01T10:01:00.000Z' } as VillageEvent);
    expect(sessionProject(mapped, 'claude:unknown')).toBe('project-cccccccccccc');
    expect(sessionProject(mapped, 'claude:unknown:helper:x')).toBe('project-cccccccccccc');
  });

  it('keeps distinct reports as a dated timeline and bounds them per session', () => {
    const inputs = Array.from({ length: LIMITS.updatesPerSession + 5 }, (_, index) =>
      update('codex:t', new Date(Date.UTC(2026, 9, 1, 10, index)).toISOString(), `Report ${index}`));
    const state = reduceAll(sequence(inputs));
    const kept = Object.values(state.updates).filter((entry) => entry.sessionId === 'codex:t');
    expect(kept).toHaveLength(LIMITS.updatesPerSession);
    expect(kept.some((entry) => entry.text === 'Report 0')).toBe(false);
    // A late, older report beyond the window changes nothing.
    const late = sequence([update('codex:t', '2026-10-01T09:00:00.000Z', 'Ancient report')], 100)[0]!;
    expect(reduce(state, late)).toBe(state);
  });

  it('keeps only increasing plan revisions', () => {
    const plan = (revision: number, seq: number) => ({ key: `plan-${revision}`, kind: 'plan.saved', source: 'owner', provenance: 'verified', projectId: 'project-dddddddddddd',
      occurredAt: '2026-10-01T10:00:00.000Z', data: { revision, validated: 1, total: 2 }, seq, receivedAt: '2026-10-01T10:00:00.000Z' }) as VillageEvent;
    const two = reduce(emptyState(), plan(2, 1));
    expect(reduce(two, plan(1, 2))).toBe(two);
    expect(reduce(two, plan(3, 2)).plans['project-dddddddddddd']!.revision).toBe(3);
  });
});

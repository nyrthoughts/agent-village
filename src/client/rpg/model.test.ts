import { describe, expect, it } from 'vitest';
import type { Worker } from '../../shared/activity.js';
import type { DerivedProject } from '../../server/truth/derive.js';
import { assignLots, persona, sessionState } from './model.js';

const now = Date.parse('2026-09-04T12:00:00Z');
const at = new Date(now).toISOString();
const worker: Worker = { id: 'claude:example', tool: 'claude', state: 'working', lastActivityAt: at };
const recent = { level: 'recent', source: 'claude-hook', observedAt: at } as const;

describe('native village model', () => {
  it('picks a stable persona in the source guild and applies only valid overrides', () => {
    const artisan = persona(worker);
    expect(artisan).toMatch(/^artisan-(0[0-9]|1[0-5])$/);
    expect(persona({ ...worker, id: worker.id })).toBe(artisan);
    expect(persona({ tool: 'codex', id: worker.id }, 4)).toBe('scholar-04');
    expect(persona(worker, 16)).toBe(artisan);
    expect(persona({ tool: 'gemini', id: worker.id })).toBeUndefined();
  });

  it('separates fresh work, inactivity, explicit requests and failures', () => {
    expect(sessionState(worker, now)).toBe('offline');
    expect(sessionState({ ...worker, activityEvidence: recent }, now)).toBe('working');
    expect(sessionState({ ...worker, activityEvidence: recent }, now + 120_001)).toBe('offline');
    expect(sessionState({ ...worker, activityEvidence: recent, state: 'waiting' }, now)).toBe('idle');
    expect(sessionState({ ...worker, state: 'waiting', title: 'Error: approval needed' }, now)).toBe('offline');
    for (const kind of ['approval', 'input'] as const) {
      expect(sessionState({ ...worker, attention: { kind, at, source: 'claude-hook' } }, now)).toBe(kind);
    }
    expect(sessionState({ ...worker, failure: { at, source: 'claude-hook' } }, now)).toBe('error');
    expect(sessionState({ ...worker, tool: 'codex', attention: { kind: 'approval', at, source: 'codex-journal' } }, now)).toBe('offline');
  });

  it('fills by recency, breaks ties predictably, preserves occupied lots and leaves the inbox off the map', () => {
    const project = (id: string, lastActivityAt = at, unassigned = false): DerivedProject => ({
      id, name: id, objective: '', effectiveStatus: 'planned', progress: { verified: 0, total: 0, remaining: 0 },
      features: [], tasks: [], observation: { lastActivityAt, unassigned, sessions: [], matchedBy: [], links: [] },
    });
    const b = project('b');
    const a = project('a');
    const c = project('c', new Date(now + 1000).toISOString());
    expect(assignLots([b, c, project('inbox', at, true), a])).toEqual(['c', 'a', 'b']);
    expect(assignLots([b, c], ['b', 'a', 'c'])).toEqual(['b', null, 'c']);
    expect(assignLots([a, b, c], ['b', null, 'c'])).toEqual(['b', 'a', 'c']);
    expect(assignLots(Array.from({ length: 10 }, (_, i) => project(String(i))))).toHaveLength(10);
  });
});

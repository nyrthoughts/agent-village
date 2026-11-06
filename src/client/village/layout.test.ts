import { describe, expect, it } from 'vitest';
import type { ProjectRow } from '../../shared/boardView.js';
import type { SessionEntity } from '../../shared/projector.js';
import { layoutVillage } from './layout.js';

function fakeRow(id: string, name: string): ProjectRow {
  return {
    id, name, status: { kind: 'working', provenance: 'observed' },
    ladder: [], blockers: [], repos: [], branches: [], sessionIds: [], attention: 0, lastSeq: 1,
  };
}

function fakeSession(id: string, projectId?: string): SessionEntity {
  return {
    id, tool: 'codex', role: 'lead', native: true, projectId, projectName: projectId,
    title: `Session ${id}`, state: 'working', stateSource: 'codex-journal', stateAt: '2025-01-01T00:00:00Z',
    identityAt: '2025-01-01T00:00:00Z', seq: 1, firstSeq: 1,
  };
}

describe('layoutVillage', () => {
  it('produces zones for each project', () => {
    const layout = layoutVillage([fakeRow('a', 'Alpha'), fakeRow('b', 'Bravo')], []);
    expect(layout.zones).toHaveLength(2);
    expect(layout.buildings).toHaveLength(2);
    expect(layout.zones[0]!.name).toBe('Alpha');
    expect(layout.zones[1]!.name).toBe('Bravo');
  });

  it('places agents inside their project zone', () => {
    const rows = [fakeRow('a', 'Alpha')];
    const sessions = [fakeSession('s1', 'a'), fakeSession('s2', 'a')];
    const layout = layoutVillage(rows, sessions);
    expect(layout.agents).toHaveLength(2);
    const zone = layout.zones[0]!;
    for (const agent of layout.agents) {
      expect(agent.x).toBeGreaterThanOrEqual(zone.x);
      expect(agent.y).toBeGreaterThanOrEqual(zone.y);
    }
  });

  it('places unmatched sessions near the entrance', () => {
    const layout = layoutVillage([fakeRow('a', 'A')], [fakeSession('u1')]);
    const unmatched = layout.agents.find((a) => a.sessionId === 'u1');
    expect(unmatched).toBeDefined();
    expect(unmatched!.projectId).toBeUndefined();
  });

  it('returns a non-empty layout for an empty board', () => {
    const layout = layoutVillage([], []);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(layout.entrance).toBeDefined();
  });
});

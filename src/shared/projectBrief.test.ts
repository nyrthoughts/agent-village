import { describe, expect, it } from 'vitest';
import { projectBrief } from './projectBrief.js';
import type { ObservedSession } from './observation.js';

const session = (id: string, history: ObservedSession['history']): ObservedSession => ({ id, tool: 'codex', title: id, state: 'idle', projectKey: 'repo', lastActivityAt: '2026-09-04T15:00:00Z', history });
describe('project catch-up', () => {
  it('merges real reports chronologically across sessions rather than following hook recency', () => {
    const brief = projectBrief([
      session('first', [{ at: '2026-09-04T11:00:00Z', kind: 'report', text: 'Earlier result.' }]),
      session('second', [{ at: '2026-09-04T12:00:00Z', kind: 'report', text: 'Latest result.' }]),
    ]);
    expect(brief.latest?.text).toBe('Latest result.');
    expect(brief.timeline.map((entry) => entry.sessionId)).toEqual(['second', 'first']);
    expect(brief.previous?.text).toBe('Earlier result.');
  });
  it('extracts explicitly headed results and next steps without promoting statements to verified facts', () => {
    const brief = projectBrief([session('one', [{ at: '2026-09-04T12:00:00Z', kind: 'report', text: '## Fait\n- Tests passés.\n## Reste à faire\n- Déployer après revue.\n## Blocage\n- Attente du domaine.' }])]);
    expect(brief.reported.done[0]?.text).toBe('Tests passés.');
    expect(brief.reported.next[0]?.text).toBe('Déployer après revue.');
    expect(brief.reported.blocked[0]?.text).toBe('Attente du domaine.');
    expect(brief.reported.done[0]?.sessionId).toBe('one');
  });
  it('does not call a question, negation or unstructured promise a completed result', () => {
    const brief = projectBrief([session('one', [{ at: '2026-09-04T12:00:00Z', kind: 'request', text: 'Déploie et termine.' }, { at: '2026-09-04T12:01:00Z', kind: 'report', text: 'Pas terminé. Je vais déployer.' }])]);
    expect(brief.reported.done).toEqual([]);
  });
  it('counts updates since a saved reading point, excludes hook-only changes and bounds history', () => {
    const entries = Array.from({ length: 150 }, (_, i) => ({ at: new Date(Date.UTC(2026, 8, 4, 0, i)).toISOString(), kind: 'report' as const, text: `Report ${i}` }));
    const brief = projectBrief([session('one', entries)], '2026-09-04T02:00:00.000Z');
    expect(brief.unread).toBe(29);
    expect(brief.timeline).toHaveLength(120);
  });
});

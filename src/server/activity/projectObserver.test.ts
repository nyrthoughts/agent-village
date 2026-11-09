import { describe, expect, it } from 'vitest';
import { parseTranscript, observedVillage, mergeLiveSessions, planAdoptions, projectId } from './projectObserver.js';

const line = (type: string, payload: unknown, timestamp = '2026-09-04T12:00:00Z') => JSON.stringify({ type, payload, timestamp });

describe('private project observer', () => {
  it('does not merge unrelated hook-only sessions with the same short folder name', () => {
    const result = mergeLiveSessions([], ['one', 'two'].map((id) => ({ id: `claude:${id}`, tool: 'claude' as const, role: 'lead' as const, state: 'working' as const, project: 'repo', lastActivityAt: '2026-09-04T12:00:00Z' })));
    expect(new Set(result.map((s) => s.projectKey)).size).toBe(2);
  });
  it('refreshes equal-time hook provenance as the observation ages, retaining reports and project ownership', () => {
    const at = '2026-09-04T12:00:00Z';
    const sessions = [{ id: 'claude:a', tool: 'claude' as const, role: 'lead' as const, state: 'working' as const, projectKey: 'repo', project: 'Project', attachedTaskId: 'building', history: [], summary: 'Report retained', lastActivityAt: at }];
    const result = mergeLiveSessions(sessions, [{ id: 'claude:a', tool: 'claude', role: 'lead', state: 'unknown', lastActivityAt: at, activityEvidence: { level: 'detected', source: 'claude-hook', observedAt: at } }]);
    expect(result[0]?.state).toBe('unknown');
    expect(result[0]?.activityEvidence?.level).toBe('detected');
    expect(result[0]?.summary).toBe('Report retained');
    expect(result[0]?.attachedTaskId).toBe('building');
  });
  it('keeps distinct building identities for focused projects even when filtered', () => {
    const names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
    const sessions = names.map((project) => ({ id: project, tool: 'codex' as const, state: 'idle' as const, projectKey: project, project, history: [], lastActivityAt: '2026-09-04T12:00:00Z' }));
    const village = observedVillage(sessions, [], names);
    expect(new Set(village.projects.map((project) => project.observation?.buildingFamilyIndex)).size).toBe(6);
    expect(observedVillage([sessions[4]!], [], names).projects[0]?.observation?.buildingFamilyIndex).toBe(4);
  });
  it('attaches helpers to the project and applies newer hooks without losing reports', () => {
    const sessions = [{ id: 'claude:a', tool: 'claude' as const, state: 'unknown' as const, projectKey: 'repo', project: 'Project', attachedTaskId: 'building', history: [], summary: 'Built parser.', lastActivityAt: '2026-09-04T12:00:00Z' }];
    const result = mergeLiveSessions(sessions, [
      { id: 'claude:a', tool: 'claude', state: 'working', lastActivityAt: '2026-09-04T12:01:00Z' },
      { id: 'helper', tool: 'claude', role: 'helper', parentId: 'claude:a', state: 'working', lastActivityAt: '2026-09-04T12:01:00Z' },
    ]);
    expect(result[0]?.summary).toBe('Built parser.');
    expect(result[0]?.state).toBe('working');
    expect(result[1]?.attachedTaskId).toBe('building');
    expect(result[1]?.projectKey).toBe('repo');
    expect(sessions[0]?.state).toBe('unknown');
  });
  it('extracts user requests and assistant reports, never tool output or reasoning', () => {
    const parsed = parseTranscript([
      line('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Connect my projects' }] }),
      line('response_item', { type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: 'Tests passed; deploy remains.' }] }),
      line('response_item', { type: 'function_call_output', output: 'SECRET TOOL OUTPUT' }),
      line('response_item', { type: 'reasoning', summary: [{ text: 'PRIVATE REASONING' }] }),
      '{partial',
    ].join('\n'), 'codex');
    expect(parsed.objective).toBe('Connect my projects');
    expect(parsed.summary).toBe('Tests passed; deploy remains.');
    expect(parsed.history).toHaveLength(2);
    expect(JSON.stringify(parsed)).not.toMatch(/SECRET|PRIVATE|partial/);
  });

  it('keeps a Codex session whose recorded remote has a malformed escape', () => {
    const parsed = parseTranscript([
      line('session_meta', { id: 'x', git: { repository_url: 'https://example.com/org/%' } }),
      line('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Still readable' }] }),
    ].join('\n'), 'codex');
    expect(parsed.repository).toBeUndefined();
    expect(parsed.objective).toBe('Still readable');
  });

  it('uses actual lifecycle events for Codex state', () => {
    expect(parseTranscript(line('event_msg', { type: 'task_started' }), 'codex').state).toBe('working');
    expect(parseTranscript(line('event_msg', { type: 'task_complete' }), 'codex').state).toBe('waiting');
    expect(parseTranscript('', 'codex').state).toBe('unknown');
  });

  it('handles Claude text and filters tool results, system notifications and thinking', () => {
    const parsed = parseTranscript([
      JSON.stringify({ type: 'user', timestamp: '2026-09-04T12:00:00Z', message: { content: 'Ship the connector' } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-09-04T12:01:00Z', message: { content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'Connector built.' }] } }),
      JSON.stringify({ type: 'user', message: { content: '<task-notification>background command</task-notification>' } }),
      JSON.stringify({ type: 'user', timestamp: '2026-09-04T12:02:00Z', message: { content: '<local-command-stdout>Authentication successful</local-command-stdout>' } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'secret' }] } }),
    ].join('\n'), 'claude');
    expect(parsed.objective).toBe('Ship the connector');
    expect(parsed.summary).toBe('Connector built.');
    expect(parsed.history).toHaveLength(2);
  });

  it('deduplicates transcript reports and bounds history', () => {
    const entry = line('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Built.' }] });
    expect(parseTranscript(Array(100).fill(entry).join('\n'), 'codex').history).toHaveLength(1);
  });

  it('reads the Codex repository record without keeping credentials, and the first request for title rules', () => {
    const parsed = parseTranscript([
      line('session_meta', { cwd: '/w/app', git: { repository_url: 'https://demo:fake-token@github.com/demo-org/app.git' } }),
      line('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'app: first' }] }),
      line('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'second' }] }, '2026-09-04T12:01:00Z'),
    ].join('\n'), 'codex');
    expect(parsed.repository).toBe('github.com/demo-org/app');
    expect(parsed.firstRequest).toBe('app: first');
    expect(parsed.objective).toBe('second');
    expect(JSON.stringify(parsed)).not.toContain('fake-token');
  });

  it('lets a hook helper inherit its lead project provenance, while hook-only leads stay pending', () => {
    const lead = { id: 'claude:a', tool: 'claude' as const, state: 'idle' as const, projectKey: 'remote:github.com/demo-org/app', project: 'app', attachedTaskId: 'b', history: [], lastActivityAt: '2026-09-04T12:00:00Z', matchedBy: 'remote' as const, matchDetail: 'github.com/demo-org/app' };
    const result = mergeLiveSessions([lead], [
      { id: 'claude:a:helper:1', tool: 'claude', role: 'helper', parentId: 'claude:a', state: 'working', lastActivityAt: '2026-09-04T12:01:00Z' },
      { id: 'claude:solo', tool: 'claude', role: 'lead', state: 'working', lastActivityAt: '2026-09-04T12:01:00Z' },
    ]);
    expect(result.find((s) => s.id === 'claude:a:helper:1')).toMatchObject({ matchedBy: 'remote', matchDetail: 'github.com/demo-org/app', projectKey: lead.projectKey });
    expect(result.find((s) => s.id === 'claude:solo')?.matchedBy).toBeUndefined();
  });

  it('exposes provenance, owner links and the Unassigned inbox without creating progress', () => {
    const base = { tool: 'codex' as const, state: 'idle' as const, history: [], lastActivityAt: '2026-09-04T12:00:00Z' };
    const village = observedVillage([
      { ...base, id: 'codex:1', projectKey: 'remote:github.com/demo-org/app', project: 'app', matchedBy: 'remote' },
      { ...base, id: 'claude:2', tool: 'claude', projectKey: 'remote:github.com/demo-org/app', project: 'app', matchedBy: 'rule' },
      { ...base, id: 'claude:3', tool: 'claude', projectKey: 'unassigned', project: 'Sessions non classées', matchedBy: 'unassigned' },
    ], [], [], {}, [
      { key: 'alias:Research', name: 'Research', links: [{ title: 'Pricing brainstorm', url: 'https://claude.ai/chat/demo', source: 'claude-app' }] },
      { key: 'alias:Empty', name: 'Empty', links: [] },
    ]);
    const byName = (name: string) => village.projects.find((project) => project.name === name);
    expect(byName('app')?.observation).toMatchObject({ matchedBy: ['rule', 'remote'], links: [] });
    expect(byName('app')?.observation?.unassigned).toBeUndefined();
    expect(byName('Sessions non classées')?.observation).toMatchObject({ unassigned: true, matchedBy: ['unassigned'] });
    expect(byName('Research')?.observation).toMatchObject({ sessions: [], lastActivityAt: '', links: [{ title: 'Pricing brainstorm' }] });
    expect(byName('Research')?.id).toBe(projectId('alias:Research'));
    expect(byName('Empty')).toBeUndefined();
    expect(village.progress.verified).toBe(0);
    expect(village.projects.at(-1)?.name).toBe('Research');
  });

  it('moves a saved plan to the regrouped project only when the move is unambiguous', () => {
    const plans = [projectId('/w/app'), projectId('/w/mono'), projectId('/w/kept'), projectId('remote:github.com/demo-org/kept')];
    const moves = planAdoptions([
      { from: '/w/app', to: 'remote:github.com/demo-org/app' },
      { from: '/w/app', to: 'remote:github.com/demo-org/app' },
      { from: '/w/mono', to: 'alias:A' }, { from: '/w/mono', to: 'alias:B' },
      { from: '/w/kept', to: 'remote:github.com/demo-org/kept' },
      { from: '/w/without-plan', to: 'remote:github.com/demo-org/other' },
      { from: '/w/app', to: 'unassigned' },
    ], plans);
    expect(moves).toEqual([{ from: projectId('/w/app'), to: projectId('remote:github.com/demo-org/app') }]);
    expect(planAdoptions([{ from: '/w/one', to: 'remote:x/y/z' }, { from: '/w/two', to: 'remote:x/y/z' }], [projectId('/w/one'), projectId('/w/two')])).toEqual([]);
  });

  it('keeps the plan with the folder project when an owner rule splits only one session out of it', () => {
    // Two sessions in /w/notes: one is pinned to a rule, the other stays a folder project.
    const moves = [{ from: '/w/notes', to: 'alias:Side project' }];
    expect(planAdoptions(moves, [projectId('/w/notes')], ['/w/notes', 'alias:Side project'])).toEqual([]);
    // Once no session resolves to the old key, the move is unambiguous again.
    expect(planAdoptions(moves, [projectId('/w/notes')], ['alias:Side project']))
      .toEqual([{ from: projectId('/w/notes'), to: projectId('alias:Side project') }]);
  });

  it('groups conversations into one building without claiming verified progress', () => {
    const base = { tool: 'codex' as const, state: 'working' as const, projectKey: '/repo/a', project: 'Project A', title: 'Build', lastActivityAt: '2026-09-04T12:00:00Z', history: [] };
    const village = observedVillage([{ ...base, id: 'codex:1' }, { ...base, id: 'codex:2', tool: 'claude' }], []);
    expect(village.projects).toHaveLength(1);
    expect(village.projects[0]?.tasks).toHaveLength(1);
    expect(village.projects[0]?.observation?.sessions).toHaveLength(2);
    expect(village.progress.verified).toBe(0);
    expect(village.projects[0]?.effectiveStatus).not.toBe('verified');
  });
});

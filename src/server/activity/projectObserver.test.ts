import { describe, expect, it } from 'vitest';
import { parseTranscript, observedVillage, mergeLiveSessions } from './projectObserver.js';

const line = (type: string, payload: unknown, timestamp = '2026-09-04T12:00:00Z') => JSON.stringify({ type, payload, timestamp });

describe('private project observer', () => {
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

import type { EventInput, VillageEvent } from './events.js';

/** Fictional event builders shared by tests and fixtures. */
let counter = 0;
export function sequence<T extends EventInput>(inputs: T[], start = 1, receivedAt = '2026-10-01T12:00:00.000Z'): VillageEvent[] {
  return inputs.map((input, index) => ({ ...input, seq: start + index, receivedAt }) as VillageEvent);
}

export function signal(sessionId: string, occurredAt: string, state: 'working' | 'waiting' | 'idle' | 'unknown' = 'working', extra: Partial<Extract<EventInput, { kind: 'session.signal' }>['data']> = {}): Extract<EventInput, { kind: 'session.signal' }> {
  return { key: `test-signal:${sessionId}:${occurredAt}:${state}:${counter++}`, kind: 'session.signal', source: 'claude-hook', provenance: 'observed', sessionId, occurredAt,
    data: { tool: 'claude', role: 'lead', state, hookEvent: state === 'waiting' ? 'Stop' : 'UserPromptSubmit', ...extra } };
}

export function observed(sessionId: string, projectId: string, occurredAt: string, extra: Partial<Extract<EventInput, { kind: 'session.observed' }>['data']> = {}): Extract<EventInput, { kind: 'session.observed' }> {
  return { key: `test-observed:${sessionId}:${occurredAt}:${counter++}`, kind: 'session.observed', source: 'codex-journal', provenance: 'observed', sessionId, projectId, occurredAt,
    data: { tool: 'codex', role: 'lead', state: 'idle', level: 'detected', title: 'Fictional session', projectName: 'Orchard', ...extra } };
}

export function update(sessionId: string, occurredAt: string, text: string, kind: 'request' | 'report' = 'report', projectId?: string): Extract<EventInput, { kind: 'session.update' }> {
  return { key: `test-update:${sessionId}:${occurredAt}:${kind}:${text.length}:${counter++}`, kind: 'session.update', source: 'codex-journal', provenance: 'declared', sessionId,
    ...(projectId ? { projectId } : {}), occurredAt, data: { tool: 'codex', kind, text, title: 'Fictional session' } };
}

export function ci(repo: string, sha: string, occurredAt: string, status: Extract<EventInput, { kind: 'github.ci' }>['data']['status']):Extract<EventInput, { kind: 'github.ci' }> {
  return { key: `test-ci:${repo}:${sha}:${status}:${occurredAt}`, kind: 'github.ci', source: 'github', provenance: 'observed', occurredAt,
    data: { repo, sha, status, name: 'checks', url: `https://github.com/${repo}/commit/${sha}/checks` } };
}

export function commit(repo: string, sha: string, occurredAt: string, branch = 'main'): Extract<EventInput, { kind: 'github.commit' }> {
  return { key: `test-commit:${repo}:${branch}:${sha}`, kind: 'github.commit', source: 'github', provenance: 'observed', occurredAt,
    data: { repo, branch, sha, message: 'Fictional change', url: `https://github.com/${repo}/commit/${sha}` } };
}

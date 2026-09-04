import { createHash } from 'node:crypto';
import type { Worker, WorkerState } from '../../shared/activity.js';
import type { ObservedSession, ObservedUpdate } from '../../shared/observation.js';
import type { DerivedWorkspace } from '../truth/derive.js';

type Json = Record<string, any>;
export interface TranscriptSnapshot {
  objective?: string;
  summary?: string;
  cwd?: string;
  lastActivityAt?: string;
  state: WorkerState;
  history: ObservedUpdate[];
}

function text(content: unknown): string {
  const raw = typeof content === 'string' ? content : Array.isArray(content)
    ? content.filter((item) => ['text', 'input_text', 'output_text'].includes(item?.type)).map((item) => item.text ?? '').join('\n') : '';
  // Read only ordinary conversation text; never export tools, reasoning or injected context.
  if (/^\s*<(?:task-notification|system-reminder|environment_context|in-app-browser-context|turn_aborted|local-command|command-name)/.test(raw)
    || raw.includes('# AGENTS.md instructions') || raw.startsWith('Base directory for this skill:') || raw.startsWith('[Request interrupted')) return '';
  return raw.replace(/\b(?:sk|ghp|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/gi, '[secret removed]')
    .replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/g, '')
    .trim().slice(0, 2400);
}

export function parseTranscript(input: string, tool: 'codex' | 'claude'): TranscriptSnapshot {
  const result: TranscriptSnapshot = { state: 'unknown', history: [] };
  for (const line of input.split('\n')) {
    let row: Json;
    try { row = JSON.parse(line); } catch { continue; }
    if (!row || typeof row !== 'object') continue;
    if (row.isMeta) continue;
    const at = typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp)) ? row.timestamp : undefined;
    if (typeof row.cwd === 'string') result.cwd = row.cwd;
    const payload = row.payload ?? {};
    if (tool === 'codex' && row.type === 'event_msg') {
      if (payload.type === 'task_started') result.state = 'working';
      if (['task_complete', 'turn_aborted'].includes(payload.type)) result.state = 'waiting';
      if (payload.type === 'item_started') result.state = 'working';
      if (payload.type === 'item_completed' && payload.item?.type === 'CommandExecution') result.state = 'working';
      if (at && ['task_started', 'task_complete', 'turn_aborted', 'item_started', 'item_completed'].includes(payload.type)) result.lastActivityAt = at;
    }
    const message = tool === 'claude' && ['assistant', 'user'].includes(row.type) ? row.message
      : tool === 'codex' && row.type === 'response_item' && payload.type === 'message' ? payload : undefined;
    if (!message || !['user', 'assistant'].includes(message.role ?? row.type)) continue;
    if (at) result.lastActivityAt = at;
    const value = text(message.content);
    if (!value || !at) continue;
    const kind = (message.role ?? row.type) === 'user' ? 'request' : 'report';
    if (kind === 'request') result.objective = value;
    else result.summary = value;
    if (tool === 'codex' && kind === 'report' && message.phase === 'final') result.state = 'waiting';
    if (!result.history.some((entry) => entry.kind === kind && entry.text === value && entry.at === at)) result.history.push({ at, kind, text: value });
    if (result.history.length > 24) result.history.shift();
  }
  return result;
}

export function projectId(key: string): string {
  return `project-${createHash('sha256').update(key).digest('hex').slice(0, 12)}`;
}

export function mergeLiveSessions(sessions: ObservedSession[], hooks: Worker[]): ObservedSession[] {
  const entries = new Map(sessions.map((session) => [session.id, { ...session }]));
  for (const hook of hooks.slice().sort((a, b) => Number(a.role === 'helper') - Number(b.role === 'helper'))) {
    const previous = entries.get(hook.id);
    if (previous) {
      if (hook.lastActivityAt > previous.lastActivityAt) entries.set(hook.id, { ...previous, state: hook.state, lastActivityAt: hook.lastActivityAt });
    } else {
      const parent = hook.parentId ? entries.get(hook.parentId) : undefined;
      const key = parent?.projectKey ?? `hook:${hook.project ?? hook.id}`;
      entries.set(hook.id, { ...hook, projectKey: key, project: parent?.project ?? hook.project,
        attachedTaskId: parent?.attachedTaskId ?? projectId(key), history: [], sourceNote: 'Événement de cycle de vie local' });
    }
  }
  return [...entries.values()];
}

export function observedVillage(sessions: ObservedSession[], errors: string[]): DerivedWorkspace {
  const groups = new Map<string, ObservedSession[]>();
  for (const session of sessions) {
    const group = groups.get(session.projectKey) ?? [];
    group.push(session);
    groups.set(session.projectKey, group);
  }
  const empty = { verified: 0, total: 0, remaining: 0 };
  return {
    version: 1, name: 'Mon village', progress: empty,
    observation: { fetchedAt: new Date().toISOString(), errors, historyWindow: '7 jours · 24 derniers échanges par session · lecture bornée à 4 Mio par journal' },
    projects: [...groups.entries()].map(([key, entries]) => {
      entries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
      const latest = entries[0]!;
      const id = projectId(key);
      const effectiveStatus = entries.some((session) => session.state === 'working') ? 'in_progress' as const : 'awaiting_review' as const;
      return {
        id, name: latest.project ?? 'Projet', objective: latest.objective ?? latest.title ?? 'Session observée',
        effectiveStatus, progress: empty, features: [],
        observation: { sessions: entries, lastActivityAt: latest.lastActivityAt },
        tasks: [{ id, title: latest.project ?? 'Projet', effectiveStatus, warnings: [], roof: false,
          progress: { ...empty, stage: 'frame' as const, stageIndex: 2 }, subtasks: [] }],
      };
    }).sort((a, b) => b.observation.lastActivityAt.localeCompare(a.observation.lastActivityAt)),
  };
}

import { createHash } from 'node:crypto';
import type { Worker, WorkerState } from '../../shared/activity.js';
import type { ObservedSession, ObservedUpdate } from '../../shared/observation.js';
import type { DerivedWorkspace } from '../truth/derive.js';
import type { ProjectPlansById } from '../../shared/projectPlan.js';
import { CONSTRUCTION_STAGES } from '../../shared/statuses.js';

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
      const hookAt = Date.parse(hook.lastActivityAt);
      const previousAt = Date.parse(previous.activityEvidence?.observedAt ?? previous.lastActivityAt);
      if (hookAt >= previousAt) entries.set(hook.id, { ...previous, state: hook.state, lastActivityAt: hook.lastActivityAt,
        role: previous.role ?? hook.role, activityEvidence: hook.activityEvidence ?? previous.activityEvidence });
    } else {
      const parent = hook.parentId ? entries.get(hook.parentId) : undefined;
      const key = parent?.projectKey ?? `hook:${hook.id}`;
      entries.set(hook.id, { ...hook, projectKey: key, project: parent?.project ?? hook.project,
        attachedTaskId: parent?.attachedTaskId ?? projectId(key), history: [], sourceNote: 'Événement de cycle de vie local' });
    }
  }
  return [...entries.values()];
}

export function observedVillage(sessions: ObservedSession[], errors: string[], focusProjects: string[] = [], plans: ProjectPlansById = {}): DerivedWorkspace {
  const groups = new Map<string, ObservedSession[]>();
  for (const session of sessions) {
    const id = projectId(session.projectKey);
    const group = groups.get(id) ?? [];
    group.push(session);
    groups.set(id, group);
  }
  for (const id of Object.keys(plans)) if (!groups.has(id)) groups.set(id, []);
  const empty = { verified: 0, total: 0, remaining: 0 };
  const workspace: DerivedWorkspace = {
    version: 1, name: 'Mon village', progress: empty,
    observation: { fetchedAt: new Date().toISOString(), errors, focusProjects, historyWindow: '7 jours · 24 derniers échanges par session · lecture bornée à 4 Mio par journal' },
    projects: [...groups.entries()].map(([id, entries]) => {
      entries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
      const latest = entries[0];
      const plan = plans[id];
      const name = latest?.project ?? plan?.projectName ?? id;
      const total = plan?.milestones.length ?? 0;
      const verified = plan?.milestones.filter((m) => m.validated).length ?? 0;
      const progress = { total, verified, remaining: total - verified };
      const completed = total > 0 && verified === total;
      const stageIndex = !total ? 0 : completed ? 5 : 1 + Math.min(3, Math.ceil(verified * 3 / total));
      const effectiveStatus = completed ? 'verified' as const : total ? 'in_progress' as const : 'planned' as const;
      return {
        id, name, objective: plan?.objective ?? '', plan,
        effectiveStatus, progress, features: [],
        observation: { sessions: entries, lastActivityAt: latest?.lastActivityAt ?? plan!.updatedAt, buildingFamilyIndex: focusProjects.includes(name) ? focusProjects.indexOf(name) : undefined },
        tasks: [{ id, title: name, effectiveStatus, warnings: [], roof: completed,
          progress: { ...progress, stage: CONSTRUCTION_STAGES[stageIndex]!, stageIndex },
          subtasks: plan?.milestones.map((m) => ({ id: `${id}:${m.id}`, title: m.title,
            effectiveStatus: m.validated ? 'verified' as const : 'planned' as const, warnings: [],
            evidence: m.validated ? [{ type: m.validatedBy === 'owner' ? 'human_review' as const : 'observed' as const, verdict: 'verified' as const, note: m.note }] : [],
          })) ?? [] }],
      };
    }).sort((a, b) => b.observation.lastActivityAt.localeCompare(a.observation.lastActivityAt)),
  };
  workspace.progress = workspace.projects.reduce((sum, p) => ({ verified: sum.verified + p.progress.verified, total: sum.total + p.progress.total, remaining: sum.remaining + p.progress.remaining }), { ...empty });
  return workspace;
}

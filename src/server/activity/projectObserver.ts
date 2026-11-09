import { createHash } from 'node:crypto';
import type { Worker, WorkerAttention, WorkerState } from '../../shared/activity.js';
import { MATCHED_BY, type ObservedSession, type ObservedUpdate } from '../../shared/observation.js';
import type { DerivedWorkspace } from '../truth/derive.js';
import type { ProjectPlansById } from '../../shared/projectPlan.js';
import { CONSTRUCTION_STAGES } from '../../shared/statuses.js';
import { normalizeRemote, UNASSIGNED_KEY, type DeclaredProject } from './projectResolver.js';

type Json = Record<string, any>;
export interface TranscriptSnapshot {
  objective?: string;
  summary?: string;
  cwd?: string;
  /** First user request in the read window; stable input for title rules. Not exported to the client. */
  firstRequest?: string;
  /** Normalised repository URL from Codex session metadata, when present. Not exported to the client. */
  repository?: string;
  lastActivityAt?: string;
  state: WorkerState;
  history: ObservedUpdate[];
  /**
   * Raw client identifiers recorded by the source (Codex `originator`/`source`, Claude `entrypoint`).
   * Used to derive `origin` and shown only by the sources doctor. Not exported to the client.
   */
  client?: { originator?: string; source?: string; entrypoint?: string };
  /** Session id recorded inside the journal itself (Codex `session_meta`). */
  sessionId?: string;
  /** Pending approval request from a structured Codex event with no later activity. */
  attention?: WorkerAttention;
  /** Number of Codex approval-request events seen in the read window (doctor only). */
  approvalEvents?: number;
}

/** Codex rollout events that ask the owner to approve a command or a patch. Unverified on live installs. */
export const CODEX_APPROVAL_EVENTS = ['exec_approval_request', 'apply_patch_approval_request'] as const;

/** Short, printable client identifier; anything else is reduced to a placeholder. */
export function clientValue(value: unknown): string | undefined {
  const raw = typeof value === 'string' ? value
    : value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value)[0] : undefined;
  if (!raw) return undefined;
  return /^[\w .:@/+-]{1,60}$/.test(raw) ? raw : '(other)';
}

export function text(content: unknown): string {
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
    if (tool === 'codex' && row.type === 'session_meta') {
      // Normalised immediately: a raw clone URL may embed credentials.
      if (typeof payload.git?.repository_url === 'string') result.repository = normalizeRemote(payload.git.repository_url) ?? result.repository;
      if (typeof payload.cwd === 'string' && payload.cwd) result.cwd = payload.cwd;
      if (typeof payload.id === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(payload.id)) result.sessionId = payload.id;
      const originator = clientValue(payload.originator);
      const source = clientValue(payload.source);
      if (originator || source) result.client = { ...result.client, ...(originator ? { originator } : {}), ...(source ? { source } : {}) };
    }
    if (tool === 'claude' && typeof row.entrypoint === 'string') result.client = { ...result.client, entrypoint: clientValue(row.entrypoint) };
    if (tool === 'codex' && (row.type === 'response_item' || (row.type === 'event_msg' && payload.type !== 'token_count'))) {
      // A structured approval request stays pending only until any later activity is recorded.
      if (row.type === 'event_msg' && (CODEX_APPROVAL_EVENTS as readonly string[]).includes(payload.type)) {
        result.approvalEvents = (result.approvalEvents ?? 0) + 1;
        if (at) result.attention = { kind: 'approval', at, source: 'codex-journal' };
      } else if (result.attention) result.attention = undefined;
    }
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
    if (kind === 'request') { result.objective = value; result.firstRequest ??= value.slice(0, 240); }
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
      // A newer hook also carries the current "needs you" signal: absent means a later event cleared it.
      if (hookAt >= previousAt) entries.set(hook.id, { ...previous, state: hook.state, lastActivityAt: hook.lastActivityAt,
        role: previous.role ?? hook.role, activityEvidence: hook.activityEvidence ?? previous.activityEvidence, attention: hook.attention });
    } else {
      const parent = hook.parentId ? entries.get(hook.parentId) : undefined;
      const key = parent?.projectKey ?? `hook:${hook.id}`;
      entries.set(hook.id, { ...hook, projectKey: key, project: parent?.project ?? hook.project,
        // Helpers inherit their lead's project and its provenance; hook-only leads have none yet.
        ...(parent ? { matchedBy: parent.matchedBy, matchDetail: parent.matchDetail, matchVia: parent.matchVia } : {}),
        attachedTaskId: parent?.attachedTaskId ?? projectId(key), history: [], sourceNote: 'Événement de cycle de vie local' });
    }
  }
  return [...entries.values()];
}

/**
 * Saved plans are keyed by project id. When resolution moves sessions to a new key
 * (for example from a Git root path to its remote), the plan follows only when exactly
 * one new project claims the old id, the new id has no plan yet and no session still
 * resolves to the old key (an owner rule that splits one session out of a folder project
 * must not take the plan away from the sessions that stay).
 */
export function planAdoptions(moves: { from: string; to: string }[], planIds: Iterable<string>, currentKeys: Iterable<string> = []): { from: string; to: string }[] {
  const saved = new Set(planIds);
  const stillUsed = new Set(currentKeys);
  const claims = new Map<string, Set<string>>();
  for (const move of moves) {
    if (move.to === UNASSIGNED_KEY || move.from === move.to || stillUsed.has(move.from)) continue;
    const from = projectId(move.from);
    const to = projectId(move.to);
    if (!saved.has(from) || saved.has(to)) continue;
    claims.set(from, (claims.get(from) ?? new Set()).add(to));
  }
  const unique = [...claims.entries()].filter(([, targets]) => targets.size === 1).map(([from, targets]) => ({ from, to: [...targets][0]! }));
  // Two old plans cannot both move into one new project.
  return unique.filter((move) => unique.filter((other) => other.to === move.to).length === 1);
}

export function observedVillage(sessions: ObservedSession[], errors: string[], focusProjects: string[] = [], plans: ProjectPlansById = {}, declared: DeclaredProject[] = []): DerivedWorkspace {
  const groups = new Map<string, ObservedSession[]>();
  for (const session of sessions) {
    const id = projectId(session.projectKey);
    const group = groups.get(id) ?? [];
    group.push(session);
    groups.set(id, group);
  }
  for (const id of Object.keys(plans)) if (!groups.has(id)) groups.set(id, []);
  const declaredById = new Map(declared.map((entry) => [projectId(entry.key), entry]));
  // A project the owner declared with links only (Claude app chats, for example) is still shown.
  for (const [id, entry] of declaredById) if (entry.links.length && !groups.has(id)) groups.set(id, []);
  const unassignedId = projectId(UNASSIGNED_KEY);
  const empty = { verified: 0, total: 0, remaining: 0 };
  const workspace: DerivedWorkspace = {
    version: 1, name: 'Mon village', progress: empty,
    observation: { fetchedAt: new Date().toISOString(), errors, focusProjects, historyWindow: '7 jours · 24 derniers échanges par session · lecture bornée à 4 Mio par journal' },
    projects: [...groups.entries()].map(([id, entries]) => {
      entries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
      const latest = entries[0];
      const plan = plans[id];
      const owner = declaredById.get(id);
      const name = latest?.project ?? plan?.projectName ?? owner?.name ?? id;
      const matchedBy = MATCHED_BY.filter((by) => entries.some((entry) => entry.matchedBy === by));
      const total = plan?.milestones.length ?? 0;
      const verified = plan?.milestones.filter((m) => m.validated).length ?? 0;
      const progress = { total, verified, remaining: total - verified };
      const completed = total > 0 && verified === total;
      const stageIndex = !total ? 0 : completed ? 5 : 1 + Math.min(3, Math.ceil(verified * 3 / total));
      const effectiveStatus = completed ? 'verified' as const : total ? 'in_progress' as const : 'planned' as const;
      return {
        id, name, objective: plan?.objective ?? '', plan,
        effectiveStatus, progress, features: [],
        observation: { sessions: entries, lastActivityAt: latest?.lastActivityAt ?? plan?.updatedAt ?? '',
          buildingFamilyIndex: focusProjects.includes(name) ? focusProjects.indexOf(name) : undefined,
          matchedBy, links: owner?.links ?? [], ...(id === unassignedId ? { unassigned: true } : {}) },
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

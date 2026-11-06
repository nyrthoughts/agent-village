import type { EventOf, EventSource, Provenance, VillageEvent } from './events.js';

/**
 * Pure projection of observation events into board entities.
 *
 * - Each entity keeps only its newest fact by `occurredAt`; a late older fact never overwrites
 *   a newer one (a delayed CI `pending` cannot replace a `success`). Equal timestamps accept a
 *   changed fact (the later-received version) and ignore an identical one.
 * - Distinct immutable facts (agent reports, requests) are separate entities ordered by occurredAt.
 * - `reduce` returns the same object when an event changes nothing. The journal relies on this
 *   to discard duplicates without assigning a sequence number.
 * - Entity counts are capped deterministically so memory stays bounded.
 */
export const LIMITS = { sessions: 1_500, updatesPerSession: 30, updates: 3_000, facts: 1_500, projects: 500, mappings: 500, tasks: 1_000 } as const;

export interface SessionEntity {
  id: string;
  tool: 'codex' | 'claude' | 'openclaw' | 'other';
  role: 'lead' | 'helper' | 'unknown';
  /** Native identity resolved by a local collector. Hook-only sessions have none. */
  native: boolean;
  projectId?: string;
  projectName?: string;
  title: string;
  parentId?: string;
  cwd?: string;
  terminal?: string;
  branch?: string;
  repo?: string;
  hint?: string;
  identityAt: string;
  state: 'working' | 'waiting' | 'idle' | 'unknown';
  level?: 'detected' | 'recent' | 'confirmed';
  hookEvent?: string;
  stateSource: EventSource;
  stateAt: string;
  seq: number;
  firstSeq: number;
}
export interface UpdateEntity {
  key: string;
  sessionId: string;
  tool: SessionEntity['tool'];
  kind: 'request' | 'report';
  text: string;
  title: string;
  at: string;
  source: EventSource;
  seq: number;
}
type FactKind = 'github.commit' | 'github.ci' | 'github.pr' | 'github.deploy';
export type FactEntity = { [K in FactKind]: { key: string; kind: K; data: EventOf<K>['data']; occurredAt: string; receivedAt: string; provenance: Provenance; source: EventSource; seq: number } }[FactKind];
export interface ProjectEntity { id: string; name: string; repo?: string; seq: number; lastAt: string }
export interface MappingEntity { sessionId: string; projectId: string; projectName: string; occurredAt: string; seq: number }
export interface PlanMark { projectId: string; revision: number; validated: number; total: number; occurredAt: string; seq: number }
export type TaskEntity = EventOf<'yaml.task'>['data'] & { projectId: string; occurredAt: string; seq: number };

export interface BoardState {
  seq: number;
  sessions: Record<string, SessionEntity>;
  updates: Record<string, UpdateEntity>;
  facts: Record<string, FactEntity>;
  projects: Record<string, ProjectEntity>;
  mappings: Record<string, MappingEntity>;
  plans: Record<string, PlanMark>;
  tasks: Record<string, TaskEntity>;
}

export function emptyState(): BoardState {
  return { seq: 0, sessions: {}, updates: {}, facts: {}, projects: {}, mappings: {}, plans: {}, tasks: {} };
}

const time = (value: string) => Date.parse(value);
/** True when a candidate fact should replace the current one. */
function supersedes(currentAt: string | undefined, currentSignature: string | undefined, nextAt: string, nextSignature: string): boolean {
  if (currentAt === undefined) return true;
  const difference = time(nextAt) - time(currentAt);
  if (difference !== 0) return difference > 0;
  return currentSignature !== nextSignature;
}
/** Key-order independent signature; undefined fields are ignored. */
function signature(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : entry);
}

function capBy<T>(record: Record<string, T>, limit: number, order: (value: T) => string): Record<string, T> {
  const keys = Object.keys(record);
  if (keys.length <= limit) return record;
  const sorted = keys.sort((a, b) => order(record[a]!).localeCompare(order(record[b]!)) || a.localeCompare(b));
  const next = { ...record };
  for (const key of sorted.slice(0, keys.length - limit)) delete next[key];
  return next;
}

function touchProject(projects: Record<string, ProjectEntity>, id: string, name: string, seq: number, at: string, repo?: string): Record<string, ProjectEntity> {
  const current = projects[id];
  const lastAt = current && time(current.lastAt) > time(at) ? current.lastAt : at;
  const next: ProjectEntity = { id, name: name || current?.name || id, ...(repo ?? current?.repo ? { repo: repo ?? current?.repo } : {}), seq, lastAt };
  if (current && signature({ ...current, seq: 0 }) === signature({ ...next, seq: 0 })) return projects;
  return capBy({ ...projects, [id]: next }, LIMITS.projects, (project) => project.lastAt);
}

function sessionObserved(state: BoardState, event: EventOf<'session.observed'>): BoardState {
  const current = state.sessions[event.sessionId];
  const { data } = event;
  const identity = { tool: data.tool, role: data.role, projectId: event.projectId, projectName: data.projectName, title: data.title,
    parentId: data.parentId, cwd: data.cwd, terminal: data.terminal, branch: data.branch, repo: data.repo };
  const currentIdentity = current?.native ? { tool: current.tool, role: current.role, projectId: current.projectId, projectName: current.projectName,
    title: current.title, parentId: current.parentId, cwd: current.cwd, terminal: current.terminal, branch: current.branch, repo: current.repo } : undefined;
  const acceptIdentity = supersedes(currentIdentity && current!.identityAt, currentIdentity && signature(currentIdentity), event.occurredAt, signature(identity));
  const stateFact = { state: data.state, level: data.level, source: event.source };
  const acceptState = supersedes(current?.stateAt, current && signature({ state: current.state, level: current.level, source: current.stateSource }), event.occurredAt, signature(stateFact));
  if (!acceptIdentity && !acceptState) return state;
  const next: SessionEntity = {
    ...(current ?? { firstSeq: event.seq }),
    id: event.sessionId,
    ...(acceptIdentity ? { ...identity, native: true, identityAt: event.occurredAt } : {}),
    ...(acceptState ? { state: data.state, level: data.level, stateSource: event.source, stateAt: event.occurredAt, hookEvent: undefined } : {}),
    seq: event.seq,
  } as SessionEntity;
  const sessions = capBy({ ...state.sessions, [event.sessionId]: clean(next) }, LIMITS.sessions, (session) => session.stateAt);
  const projects = acceptIdentity ? touchProject(state.projects, event.projectId, data.projectName, event.seq, event.occurredAt, data.repo) : state.projects;
  return { ...state, seq: event.seq, sessions, projects };
}

function sessionSignal(state: BoardState, event: EventOf<'session.signal'>): BoardState {
  const current = state.sessions[event.sessionId];
  const { data } = event;
  const fact = { state: data.state, hookEvent: data.hookEvent, source: event.source };
  const acceptState = supersedes(current?.stateAt, current && signature({ state: current.state, hookEvent: current.hookEvent, source: current.stateSource }), event.occurredAt, signature(fact));
  // A hook may introduce an unknown session; it never replaces a native identity.
  const addIdentity = !current;
  if (!acceptState && !addIdentity) return state;
  const next: SessionEntity = current ? { ...current } : {
    id: event.sessionId, tool: data.tool, role: data.role, native: false, title: data.title ?? data.hint ?? event.sessionId,
    parentId: data.parentId, hint: data.hint, identityAt: event.occurredAt, state: data.state, stateSource: event.source,
    stateAt: event.occurredAt, seq: event.seq, firstSeq: event.seq,
  };
  if (acceptState) Object.assign(next, { state: data.state, hookEvent: data.hookEvent, level: 'recent', stateSource: event.source, stateAt: event.occurredAt });
  if (!next.native && data.title) next.title = data.title;
  next.seq = event.seq;
  return { ...state, seq: event.seq, sessions: capBy({ ...state.sessions, [event.sessionId]: clean(next) }, LIMITS.sessions, (session) => session.stateAt) };
}

function sessionUpdate(state: BoardState, event: EventOf<'session.update'>): BoardState {
  if (state.updates[event.key]) return state;
  const update: UpdateEntity = { key: event.key, sessionId: event.sessionId, tool: event.data.tool, kind: event.data.kind, text: event.data.text,
    title: event.data.title, at: event.occurredAt, source: event.source, seq: event.seq };
  let updates = { ...state.updates, [event.key]: update };
  const own = Object.values(updates).filter((entry) => entry.sessionId === event.sessionId);
  if (own.length > LIMITS.updatesPerSession) {
    own.sort((a, b) => time(a.at) - time(b.at) || a.key.localeCompare(b.key));
    for (const entry of own.slice(0, own.length - LIMITS.updatesPerSession)) delete updates[entry.key];
    if (!updates[event.key]) return state; // Older than every retained update of this session.
  }
  updates = capBy(updates, LIMITS.updates, (entry) => entry.at);
  if (!updates[event.key]) return state;
  return { ...state, seq: event.seq, updates };
}

function factEvent(state: BoardState, event: EventOf<FactKind>): BoardState {
  const entity = event.kind === 'github.commit' ? `commit:${event.data.repo}:${event.data.branch}`
    : event.kind === 'github.ci' ? `ci:${event.data.repo}:${event.data.sha}`
      : event.kind === 'github.pr' ? `pr:${event.data.repo}:${event.data.number}`
        : `deploy:${event.data.repo}:${event.data.id}`;
  const current = state.facts[entity];
  if (!supersedes(current?.occurredAt, current && signature(current.data), event.occurredAt, signature(event.data))) return state;
  const fact = { key: entity, kind: event.kind, data: event.data, occurredAt: event.occurredAt, receivedAt: event.receivedAt,
    provenance: event.provenance, source: event.source, seq: event.seq } as FactEntity;
  return { ...state, seq: event.seq, facts: capBy({ ...state.facts, [entity]: fact }, LIMITS.facts, (value) => value.occurredAt) };
}

function identityMapped(state: BoardState, event: EventOf<'identity.mapped'>): BoardState {
  const current = state.mappings[event.data.sessionId];
  const value = { projectId: event.data.projectId, projectName: event.data.projectName };
  if (!supersedes(current?.occurredAt, current && signature({ projectId: current.projectId, projectName: current.projectName }), event.occurredAt, signature(value))) return state;
  const mapping: MappingEntity = { sessionId: event.data.sessionId, ...value, occurredAt: event.occurredAt, seq: event.seq };
  return { ...state, seq: event.seq, mappings: capBy({ ...state.mappings, [mapping.sessionId]: mapping }, LIMITS.mappings, (entry) => entry.occurredAt) };
}

function planSaved(state: BoardState, event: EventOf<'plan.saved'>): BoardState {
  const current = state.plans[event.projectId];
  if (current && current.revision >= event.data.revision) return state;
  return { ...state, seq: event.seq, plans: { ...state.plans, [event.projectId]: { projectId: event.projectId, ...event.data, occurredAt: event.occurredAt, seq: event.seq } } };
}

function yamlTask(state: BoardState, event: EventOf<'yaml.task'>): BoardState {
  const key = `${event.projectId}:${event.data.taskId}`;
  const current = state.tasks[key];
  const currentData = current && (({ projectId: _project, occurredAt: _at, seq: _seq, ...data }) => data)(current);
  if (!supersedes(current?.occurredAt, currentData && signature(currentData), event.occurredAt, signature(event.data))) return state;
  const tasks = capBy({ ...state.tasks, [key]: { ...event.data, projectId: event.projectId, occurredAt: event.occurredAt, seq: event.seq } }, LIMITS.tasks, (task) => task.occurredAt);
  return { ...state, seq: event.seq, tasks, projects: touchProject(state.projects, event.projectId, event.data.projectName, event.seq, event.occurredAt) };
}

function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function reduce(state: BoardState, event: VillageEvent): BoardState {
  switch (event.kind) {
    case 'session.observed': return sessionObserved(state, event);
    case 'session.signal': return sessionSignal(state, event);
    case 'session.update': return sessionUpdate(state, event);
    case 'identity.mapped': return identityMapped(state, event);
    case 'plan.saved': return planSaved(state, event);
    case 'yaml.task': return yamlTask(state, event);
    case 'github.commit': case 'github.ci': case 'github.pr': case 'github.deploy': return factEvent(state, event);
  }
}

export function reduceAll(events: readonly VillageEvent[], initial: BoardState = emptyState()): BoardState {
  return events.reduce(reduce, initial);
}

/**
 * Project attribution, in order: native collector identity, explicit owner mapping, then the
 * resolved project of a parent session. Anything else stays unmatched; names are never compared.
 */
export function sessionProject(state: BoardState, sessionId: string, depth = 0): string | undefined {
  const session = state.sessions[sessionId];
  if (session?.native && session.projectId) return session.projectId;
  const mapped = state.mappings[sessionId]?.projectId;
  if (mapped) return mapped;
  if (session?.parentId && depth < 8) return sessionProject(state, session.parentId, depth + 1);
  return undefined;
}

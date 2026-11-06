import { readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { ActivitySnapshot } from '../../shared/activity.js';
import type { BoardContext, BoardSnapshot, SourceHealth, StreamMessage } from '../../shared/board.js';
import { eventInputSchema, type EventInput, type VillageEvent } from '../../shared/events.js';
import { emptyState, reduceAll } from '../../shared/projector.js';
import { projectPlanSchema } from '../../shared/projectPlan.js';
import type { ActivityMapping, Workspace } from '../../shared/schema.js';
import { fetchAmcActivity } from '../activity/amcAdapter.js';
import { loadWorkspace } from '../config/load.js';
import { digest } from '../events/adapters.js';
import type { Replay } from '../events/journal.js';
import { deriveWorkspace, type DerivedTask, type DerivedWorkspace, type VerdictsById } from '../truth/derive.js';
import { verifyWorkspaceEvidence } from '../truth/evidence/verify.js';

export const demoFixtureSchema = z.object({
  version: z.literal(1),
  /** Every name, repository and message in this file is fictional. */
  fictional: z.literal(true),
  capturedAt: z.string().datetime(),
  plans: z.record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), projectPlanSchema).default({}),
  events: z.array(z.unknown()).max(5_000),
}).strict();

function assign(inputs: readonly EventInput[], receivedAt: string): VillageEvent[] {
  return inputs.map((input, index) => ({ ...input, occurredAt: new Date(input.occurredAt).toISOString(), seq: index + 1, receivedAt }) as VillageEvent);
}

/** Builds the fictional demo board. Relative ages in the UI use `generatedAt` (the capture time). */
export function fixtureSnapshot(raw: unknown): BoardSnapshot {
  const fixture = demoFixtureSchema.parse(raw);
  const inputs = fixture.events.map((event) => eventInputSchema.parse(event));
  const events = assign(inputs, fixture.capturedAt);
  const state = reduceAll(events);
  return {
    epoch: `fixture-${digest(fixture.capturedAt, events.length)}`, seq: state.seq, state, plans: fixture.plans,
    health: [{ id: 'fixture', label: 'Données fictives', kind: 'fixture', lastOkAt: fixture.capturedAt }],
    mode: 'demo', fictional: true, generatedAt: fixture.capturedAt, capabilities: { stream: false, editPlans: false, mapProjects: false }, errors: [],
  };
}

const safeId = (value: string) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : `yaml-${digest(value).slice(0, 12)}`;

/** YAML workspace + verifier verdicts → board events. Statuses stay declared unless evidence verified them. */
export function yamlEvents(workspace: DerivedWorkspace, occurredAt: string, activity?: ActivitySnapshot): EventInput[] {
  const inputs: EventInput[] = [];
  const projectOfTask = new Map<string, string>();
  for (const project of workspace.projects) {
    const projectId = safeId(project.id);
    const tasks: DerivedTask[] = [...project.features.flatMap((feature) => feature.tasks), ...project.tasks];
    for (const task of tasks) {
      projectOfTask.set(task.id, projectId);
      const verdicts = [...(task.evidence ?? []), ...task.subtasks.flatMap((subtask) => subtask.evidence ?? [])];
      // Exact proof identity when the YAML names it; nothing is inferred otherwise.
      const verifiedSha = verdicts.find((item) => item.type === 'commit' && item.verdict === 'verified' && /^[a-f0-9]{7,64}$/.test(item.sha?.toLowerCase() ?? ''))?.sha?.toLowerCase();
      const data = {
        taskId: task.id.slice(0, 160).replace(/[^A-Za-z0-9._:@/+-]/g, '-'), projectName: project.name.slice(0, 160), objective: project.objective.slice(0, 700),
        title: task.title.slice(0, 180), ...(task.declaredStatus ? { declaredStatus: task.declaredStatus } : {}), effectiveStatus: task.effectiveStatus,
        ...(task.nextAction ? { nextAction: task.nextAction.slice(0, 400) } : {}), ...(task.blockedReason ? { blockedReason: task.blockedReason.slice(0, 400) } : {}),
        ...(task.owner ? { owner: task.owner.slice(0, 80) } : {}),
        verifiedCommit: verdicts.some((item) => item.type === 'commit' && item.verdict === 'verified'),
        verifiedReview: verdicts.some((item) => item.type === 'human_review' && item.verdict === 'verified'),
        warnings: [...new Set([...task.warnings, ...task.subtasks.flatMap((subtask) => subtask.warnings)])].slice(0, 2),
        ...(verifiedSha ? { verifiedSha } : {}),
      };
      inputs.push({ key: `yaml:task:${digest(projectId, data)}`, kind: 'yaml.task', source: 'yaml', provenance: data.verifiedCommit || data.verifiedReview ? 'verified' : 'declared',
        projectId, occurredAt, data });
    }
  }
  for (const worker of activity?.workers ?? []) {
    const projectId = worker.attachedTaskId ? projectOfTask.get(worker.attachedTaskId) : undefined;
    if (!projectId || !Number.isFinite(Date.parse(worker.lastActivityAt))) continue;
    const projectName = workspace.projects.find((project) => safeId(project.id) === projectId)?.name ?? projectId;
    inputs.push({ key: `amc:${digest(worker)}`, kind: 'session.observed', source: 'amc', provenance: 'observed', sessionId: `amc:${worker.id}`.slice(0, 160), projectId,
      occurredAt: worker.lastActivityAt, data: { tool: worker.tool, role: worker.role ?? 'unknown', state: worker.state, level: 'detected',
        title: (worker.title ?? worker.id).slice(0, 120), projectName: projectName.slice(0, 160) } });
  }
  return inputs;
}

/** Common read interface of every board provider. */
export interface BoardProvider {
  readonly epoch: string;
  readonly seq: number;
  snapshot(): BoardSnapshot;
  context(): BoardContext;
  replay(after: number, epoch?: string): Replay;
  subscribe(listener: (message: StreamMessage) => void): () => void;
  ready?: Promise<void>;
  stop(): void;
}

/** Fixed fictional board (demo mode). No stream: the client polls. */
export class FixtureBoard implements BoardProvider {
  readonly #snapshot: BoardSnapshot;
  constructor(path: string) { this.#snapshot = fixtureSnapshot(JSON.parse(readFileSync(path, 'utf8'))); }
  get epoch() { return this.#snapshot.epoch; }
  get seq() { return this.#snapshot.seq; }
  snapshot(): BoardSnapshot { return this.#snapshot; }
  context(): BoardContext { return { plans: this.#snapshot.plans, health: this.#snapshot.health, errors: [] }; }
  replay(): Replay { return { kind: 'reset' }; }
  subscribe(): () => void { return () => undefined; }
  stop(): void { /* Static. */ }
}

/**
 * YAML modes. Evidence verification (Git subprocesses) and the optional loopback AMC read run
 * on a background timer; HTTP routes only read the cached snapshot.
 */
export class YamlBoard implements BoardProvider {
  #snapshot: BoardSnapshot;
  #mtime = -1;
  #workspace?: Workspace;
  #derived?: DerivedWorkspace;
  #mappings: ActivityMapping[] = [];
  #timer?: ReturnType<typeof setInterval>;
  #running?: Promise<void>;
  #again = false;
  #stopped = false;
  refreshes = 0;
  readonly ready: Promise<void>;

  constructor(private readonly options: { villagePath: string; mode: 'truth-only' | 'live'; amcEndpoint?: string; demoActivityPath?: string; intervalMs?: number; now?: () => Date;
    verify?: (workspace: Workspace, directory: string) => Promise<VerdictsById> }) {
    this.#snapshot = this.#build([], []);
    this.ready = this.refresh();
    this.#timer = setInterval(() => void this.refresh(), options.intervalMs ?? 5_000);
    this.#timer.unref?.();
  }

  get epoch() { return this.#snapshot.epoch; }
  get seq() { return this.#snapshot.seq; }
  snapshot(): BoardSnapshot { return this.#snapshot; }
  context(): BoardContext { return { plans: {}, health: this.#snapshot.health, errors: this.#snapshot.errors }; }
  replay(): Replay { return { kind: 'reset' }; }
  subscribe(): () => void { return () => undefined; }
  stop(): void { this.#stopped = true; if (this.#timer) clearInterval(this.#timer); this.#timer = undefined; }

  /**
   * Serialized: a call during a run schedules exactly one more. Evidence is re-verified on every
   * refresh (a commit can become valid without any YAML edit); the YAML is re-parsed only when
   * its modification time changes.
   */
  refresh(): Promise<void> {
    if (this.#running) { this.#again = true; return this.#running; }
    this.#running = this.#refresh().catch(() => undefined).finally(() => {
      this.#running = undefined;
      if (this.#again && !this.#stopped) { this.#again = false; void this.refresh(); }
    });
    return this.#running;
  }

  async #refresh(): Promise<void> {
    this.refreshes++;
    const now = (this.options.now ?? (() => new Date()))();
    const errors: string[] = [];
    const health: SourceHealth[] = [];
    try {
      const mtime = statSync(this.options.villagePath).mtimeMs;
      if (mtime !== this.#mtime || !this.#workspace) {
        const loaded = loadWorkspace(this.options.villagePath);
        if (!loaded.ok) throw new Error(loaded.errors.map((error) => `${error.path || 'village'}: ${error.message}`).join('; ').slice(0, 300));
        this.#workspace = loaded.workspace;
        this.#mappings = loaded.workspace.activity_mapping ?? [];
        this.#mtime = mtime;
      }
      const verify = this.options.verify ?? verifyWorkspaceEvidence;
      this.#derived = deriveWorkspace(this.#workspace, await verify(this.#workspace, dirname(this.options.villagePath)));
      health.push({ id: 'yaml', label: 'YAML', kind: 'poll', cadenceMs: this.options.intervalMs ?? 5_000, lastOkAt: now.toISOString() });
    } catch (error) {
      errors.push(`Configuration YAML invalide : ${error instanceof Error ? error.message : 'illisible'}`.slice(0, 400));
      health.push({ id: 'yaml', label: 'YAML', kind: 'poll', cadenceMs: this.options.intervalMs ?? 5_000, lastErrorAt: now.toISOString(), lastError: 'configuration invalide' });
    }
    let activity: ActivitySnapshot | undefined;
    if (this.options.mode === 'live' && this.#derived) {
      activity = await fetchAmcActivity({ endpoint: this.options.amcEndpoint ?? 'http://127.0.0.1:3000/api/dashboard', mappings: this.#mappings, now: () => now });
      health.push({ id: 'amc', label: 'AMC local', kind: 'poll', cadenceMs: this.options.intervalMs ?? 5_000,
        ...(activity.status === 'degraded' ? { lastErrorAt: now.toISOString(), lastError: 'point d’accès indisponible' } : { lastOkAt: now.toISOString() }) });
    }
    const occurredAt = new Date(this.#mtime > 0 ? this.#mtime : now.getTime()).toISOString();
    this.#snapshot = this.#build(this.#derived ? yamlEvents(this.#derived, occurredAt, activity) : [], health, errors, now);
  }

  #build(inputs: EventInput[], health: SourceHealth[], errors: string[] = [], now = new Date()): BoardSnapshot {
    const events = assign(inputs, now.toISOString());
    const state = events.length ? reduceAll(events) : emptyState();
    return { epoch: `yaml-${digest(this.options.villagePath, this.#mtime)}`, seq: state.seq, state, plans: {}, health, mode: this.options.mode, fictional: false,
      generatedAt: now.toISOString(), capabilities: { stream: false, editPlans: false, mapProjects: false }, errors };
  }
}

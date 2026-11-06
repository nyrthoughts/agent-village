import { join } from 'node:path';
import type { BoardContext, BoardSnapshot, StreamMessage } from '../../shared/board.js';
import type { EventInput } from '../../shared/events.js';
import type { PlanDraft, ProjectPlan, ProjectPlansById } from '../../shared/projectPlan.js';
import { sessionProject } from '../../shared/projector.js';
import type { HookObservation } from '../activity/hookStore.js';
import type { OwnerAuth } from '../auth/ownerAuth.js';
import { digest, hookEvent } from '../events/adapters.js';
import { EventJournal, type Replay } from '../events/journal.js';
import { ProjectPlans } from '../projectPlans.js';
import { GitHubSource, type GhRunner } from '../sources/github.js';
import { HealthRegistry } from '../sources/health.js';
import { NativeRefresher, type NativeCollector, type WatchFactory } from '../sources/native.js';
import { projectId as projectIdFor } from '../activity/projectObserver.js';
import { MappingStore } from './mappings.js';

export interface NativeBoardOptions {
  /** Private owner directory (0700); the journal lives in its `journal/` child. */
  directory: string;
  ownerAuth: Pick<OwnerAuth, 'hasActiveSession'>;
  collector?: NativeCollector;
  hooks?: { observe(listener: (observation: HookObservation) => void): () => void };
  plans?: ProjectPlans;
  aliases?: Record<string, string>;
  github?: { repos: readonly string[]; intervalMs?: number; run?: GhRunner };
  journal?: { capacity?: number; maxAgeMs?: number };
  pollMs?: number;
  debounceMs?: number;
  watch?: WatchFactory | false;
  now?: () => Date;
}

export class BoardError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

const UNREADABLE_PLANS = 'Objectifs privés illisibles. Aucune progression déduite.';

/**
 * Private native board: journal + projection, read-only sources, owner ledgers.
 * Receiving an event only appends to the journal and notifies readers; nothing is executed.
 * Collection runs only while an owner session is active.
 */
export class NativeBoard {
  readonly journal: EventJournal;
  readonly health: HealthRegistry;
  readonly plans: ProjectPlans;
  readonly mappings: MappingStore;
  readonly refresher?: NativeRefresher;
  readonly github?: GitHubSource;
  readonly #listeners = new Set<(message: StreamMessage) => void>();
  readonly #disposers: (() => void)[] = [];
  readonly #now: () => Date;
  readonly #aliases: Record<string, string>;
  #contextSignature = '';
  #stopped = false;
  #hookError?: string;

  constructor(private readonly options: NativeBoardOptions) {
    this.#now = options.now ?? (() => new Date());
    this.#aliases = options.aliases ?? {};
    this.journal = new EventJournal({ directory: join(options.directory, 'journal'), now: this.#now, ...options.journal });
    this.health = new HealthRegistry(this.#now);
    this.plans = options.plans ?? new ProjectPlans(options.directory);
    this.mappings = new MappingStore(options.directory);
    const active = () => options.ownerAuth.hasActiveSession();
    if (options.collector) {
      this.refresher = new NativeRefresher({ collector: options.collector, journal: this.journal, health: this.health,
        pollMs: options.pollMs, debounceMs: options.debounceMs, watch: options.watch, shouldContinue: active });
      this.health.pause(['codex', 'claude'], true);
    }
    if (options.github?.repos.length) {
      this.github = new GitHubSource({ ...options.github, journal: this.journal, health: this.health, shouldContinue: active });
      this.health.pause(options.github.repos.map((repo) => `github:${repo}`), true);
    }
    if (options.hooks) {
      this.health.register({ id: 'claude-hook', label: 'Hooks Claude', kind: 'push' });
      this.health.register({ id: 'openclaw-hook', label: 'Hooks OpenClaw', kind: 'push' });
      this.#disposers.push(options.hooks.observe((observation) => this.#ingestHook(observation)));
    }
    this.#disposers.push(this.journal.subscribe((event) => this.#broadcast({ type: 'event', event })));
    this.#disposers.push(this.health.onChange(() => this.#broadcastContext()));
    this.#restoreMappings();
  }

  get epoch(): string { return this.journal.epoch; }
  get seq(): number { return this.journal.seq; }

  context(): BoardContext {
    const errors: string[] = [];
    let plans: ProjectPlansById = {};
    try { plans = this.plans.read(); } catch { errors.push(UNREADABLE_PLANS); }
    if (this.journal.indexError) errors.push(this.journal.indexError);
    if (this.#hookError) errors.push(this.#hookError);
    return { plans, health: this.health.list(), errors };
  }

  snapshot(): BoardSnapshot {
    return { epoch: this.epoch, seq: this.journal.seq, state: this.journal.state, ...this.context(), mode: 'native', fictional: false,
      generatedAt: this.#now().toISOString(), capabilities: { stream: true, editPlans: true, mapProjects: true } };
  }

  replay(after: number, epoch?: string): Replay {
    return epoch && epoch !== this.epoch ? { kind: 'reset' } : this.journal.since(after);
  }

  subscribe(listener: (message: StreamMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  /**
   * Called after an authorized board read. Sources start on a later tick: the request itself
   * never runs a collector or a subprocess.
   */
  activate(): void {
    if (this.#stopped) return;
    const allowed = () => !this.#stopped && this.options.ownerAuth.hasActiveSession();
    if (this.refresher && !this.refresher.active) setImmediate(() => { if (allowed()) void this.refresher!.start(); });
    if (this.github && !this.github.active) setImmediate(() => { if (allowed()) this.github!.start(); });
  }

  /** The ledger stays the only source of validation; the journal only records that it changed. */
  savePlan(projectId: string, plan: PlanDraft, revision: number): ProjectPlan {
    const known = Boolean(this.journal.state.projects[projectId]) || Boolean(this.context().plans[projectId]);
    if (!known) throw new BoardError(404, 'unknown_project');
    const saved = this.plans.save(projectId, plan, revision, 'owner', this.journal.state.projects[projectId]?.name);
    this.journal.append({ key: `owner:plan:${digest(projectId, saved.revision)}`, kind: 'plan.saved', source: 'owner', provenance: 'verified', projectId,
      occurredAt: saved.updatedAt, data: { revision: saved.revision, validated: saved.milestones.filter((m) => m.validated).length, total: saved.milestones.length } });
    this.#broadcastContext(true);
    return saved;
  }

  /** Attaches an unmatched session to a known project; native identities cannot be reassigned. */
  saveMapping(sessionId: string, projectId: string): void {
    const state = this.journal.state;
    const session = state.sessions[sessionId];
    if (!session) throw new BoardError(404, 'unknown_session');
    if (session.native) throw new BoardError(409, 'native_identity');
    const project = state.projects[projectId];
    const plan = this.context().plans[projectId];
    if (!project && !plan) throw new BoardError(404, 'unknown_project');
    const mappedAt = this.#now().toISOString();
    const projectName = (project?.name ?? plan?.projectName ?? projectId).slice(0, 160);
    this.mappings.save(sessionId, { projectId, projectName, mappedAt });
    this.journal.append(this.#mappingEvent(sessionId, projectId, projectName, mappedAt));
  }

  /** Final: collectors stop first (late results are dropped), then the journal closes for good. */
  stop(): void {
    this.#stopped = true;
    this.refresher?.stop();
    this.github?.stop();
    for (const dispose of this.#disposers.splice(0)) dispose();
    this.#listeners.clear();
    this.journal.close();
  }

  #mappingEvent(sessionId: string, projectId: string, projectName: string, occurredAt: string): EventInput {
    return { key: `owner:mapping:${digest(sessionId, projectId, occurredAt)}`, kind: 'identity.mapped', source: 'owner', provenance: 'verified', occurredAt,
      data: { sessionId, projectId, projectName } };
  }

  #restoreMappings(): void {
    try {
      const events = Object.entries(this.mappings.read()).map(([sessionId, mapping]) => this.#mappingEvent(sessionId, mapping.projectId, mapping.projectName, mapping.mappedAt));
      this.journal.appendMany(events);
    } catch { /* An unreadable mapping file leaves sessions unmatched; nothing is guessed. */ }
  }

  #ingestHook(observation: HookObservation): void {
    const source = observation.tool === 'claude' ? 'claude-hook' : 'openclaw-hook';
    try { this.journal.append(hookEvent(observation)); }
    catch (error) {
      // Visible, never reported as received; the route answers 503 so the producer may retry.
      this.health.fail(source, 'journal local indisponible');
      this.#hookError = 'Journal local indisponible : des hooks n’ont pas été enregistrés.';
      this.#broadcastContext();
      throw error;
    }
    this.#hookError = undefined;
    this.health.ok(source);
    // Explicit owner configuration (VILLAGE_PROJECT_ALIASES `session:<id>`) is an owner mapping.
    const alias = this.#aliases[`session:${observation.sessionId}`];
    if (alias && !this.journal.state.mappings[observation.sessionId] && !sessionProject(this.journal.state, observation.sessionId)) {
      this.journal.append(this.#mappingEvent(observation.sessionId, projectIdFor(`alias:${alias}`), alias.slice(0, 160), observation.at.toISOString()));
    }
  }

  #broadcastContext(force = false): void {
    const context = this.context();
    const signature = JSON.stringify(context);
    if (!force && signature === this.#contextSignature) return;
    this.#contextSignature = signature;
    this.#broadcast({ type: 'context', context });
  }

  #broadcast(message: StreamMessage): void {
    for (const listener of [...this.#listeners]) { try { listener(message); } catch { /* One reader never blocks another. */ } }
  }
}

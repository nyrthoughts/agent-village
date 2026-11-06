import { execFile } from 'node:child_process';
import { z } from 'zod';
import { isSafeSourceUrl, type EventInput } from '../../shared/events.js';
import { redactTitle } from '../activity/redact.js';
import { digest } from '../events/adapters.js';
import type { EventJournal } from '../events/journal.js';
import type { HealthRegistry } from './health.js';

/**
 * Optional, per-repository GitHub reader. Disabled unless the owner lists repositories.
 * It runs `gh api --method GET` with conditional ETag requests from a periodic timer only;
 * no HTTP route invokes it. Results are observed facts with the URLs GitHub returned, after
 * redaction and with credential-bearing links dropped.
 */
export type GhRunner = (args: readonly string[]) => Promise<{ stdout: string; exitCode: number }>;

export const ghRunner: GhRunner = (args) => new Promise((resolve) => {
  execFile('gh', ['api', '--method', 'GET', '--include', ...args], {
    timeout: 10_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', GH_NO_UPDATE_NOTIFIER: '1' },
  }, (error, stdout) => resolve({ stdout: String(stdout ?? ''), exitCode: error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0 }));
});

export const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
export function githubInterval(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(60_000, Math.max(30_000, parsed)) : 45_000;
}

/** Observed branches polled per repository, newest activity first (plus the default branch). */
export const MAX_BRANCHES = 5;
/** Check-run pages read per commit (100 runs each). More than this is reported as partial. */
export const MAX_CHECK_PAGES = 3;

const shaPattern = /^[a-f0-9]{7,64}$/;
const branchPattern = /^[A-Za-z0-9._/-]{1,200}$/;
const link = z.string().max(2_000).optional().nullable().catch(undefined);
const repository = z.object({ default_branch: z.string().regex(branchPattern) });
const commitSchema = z.object({ sha: z.string().regex(shaPattern), html_url: link,
  commit: z.object({ message: z.string(), committer: z.object({ date: z.string().datetime() }).nullable().optional() }) });
const checkRuns = z.object({ total_count: z.number().int().min(0).optional(), check_runs: z.array(z.object({ name: z.string().max(200), status: z.string(), conclusion: z.string().nullable(),
  started_at: z.string().datetime().nullable().optional(), completed_at: z.string().datetime().nullable().optional(), html_url: link })).max(100) });
const pulls = z.array(z.object({ number: z.number().int().positive(), state: z.enum(['open', 'closed']), title: z.string(), merged_at: z.string().datetime().nullable(),
  closed_at: z.string().datetime().nullable(), updated_at: z.string().datetime(), html_url: link, merge_commit_sha: z.string().regex(shaPattern).nullable().optional().catch(undefined),
  head: z.object({ sha: z.string().regex(shaPattern), ref: z.string().max(200) }) })).max(30);
const deployments = z.array(z.object({ id: z.number().int().positive(), sha: z.string().regex(shaPattern), environment: z.string().max(80), created_at: z.string().datetime() })).max(10);
const statuses = z.array(z.object({ state: z.string(), created_at: z.string().datetime(), environment_url: z.string().optional(), target_url: z.string().optional() })).max(5);

interface Response { status: number; etag?: string; body?: unknown }

export function parseGhResponse(stdout: string): Response | undefined {
  const separator = /\r?\n\r?\n/.exec(stdout);
  if (!separator) return undefined;
  const head = stdout.slice(0, separator.index).split(/\r?\n/);
  const status = /^HTTP\/[\d.]+\s+(\d{3})/.exec(head[0] ?? '')?.[1];
  if (!status) return undefined;
  const etag = head.slice(1).map((line) => /^etag:\s*(.+)$/i.exec(line)?.[1]?.trim()).find(Boolean);
  const text = stdout.slice(separator.index + separator[0].length).trim();
  let body: unknown;
  if (text) { try { body = JSON.parse(text); } catch { return undefined; } }
  return { status: Number(status), ...(etag ? { etag } : {}), ...(body !== undefined ? { body } : {}) };
}

/** Source text is redacted (paths, emails, token formats) before it can reach the journal. */
export const sourceText = (value: string, max: number) => redactTitle(value.split('\n')[0] ?? '').slice(0, max);
/** A link is kept only when it is https and carries no credential; the fact itself is kept either way. */
export function safeLink(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && isSafeSourceUrl(value) ? value : undefined;
}

type Run = z.infer<typeof checkRuns>['check_runs'][number];
const FAILING = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure']);
const NEUTRAL = new Set(['neutral', 'skipped']);

/**
 * Aggregates check runs. Green (`success`) requires every run to have been read (no missing
 * page), every run completed, and every conclusion recognized as success/neutral/skipped with
 * at least one success. Partial pages or unrecognized conclusions give `unknown`.
 */
export function ciStatus(runs: Run[], complete: boolean, total = runs.length): { status: 'pending' | 'success' | 'failure' | 'neutral' | 'unknown'; at?: string; url?: string; name: string } | undefined {
  if (runs.length === 0) return undefined;
  const failing = runs.find((run) => run.status === 'completed' && FAILING.has(run.conclusion ?? ''));
  const pending = runs.find((run) => run.status !== 'completed');
  const unknown = runs.find((run) => run.status === 'completed' && run.conclusion !== 'success' && !FAILING.has(run.conclusion ?? '') && !NEUTRAL.has(run.conclusion ?? ''));
  const at = runs.map((run) => run.completed_at ?? run.started_at).filter((value): value is string => Boolean(value)).sort().at(-1);
  const status = failing ? 'failure' : pending ? 'pending' : !complete || unknown ? 'unknown'
    : runs.some((run) => run.conclusion === 'success') ? 'success' : 'neutral';
  const pick = failing ?? pending ?? unknown;
  const name = pick ? sourceText(pick.name, 120) : !complete ? `${runs.length}/${total} checks` : `${runs.length} checks`;
  return { status, at, url: safeLink(pick?.html_url ?? runs[0]!.html_url), name: name || 'checks' };
}

const deployState = (state: string) => state === 'success' ? 'success' as const : ['failure', 'error'].includes(state) ? 'failure' as const : state === 'inactive' ? 'inactive' as const : 'pending' as const;

class Stale extends Error {}
class StorageFailure extends Error {}

export class GitHubSource {
  readonly #cache = new Map<string, { etag?: string; body: unknown }>();
  #timer?: ReturnType<typeof setInterval>;
  #running = false;
  /** Incremented by `stop()`: requests started before it never append their results. */
  #generation = 0;

  constructor(private readonly options: {
    repos: readonly string[];
    journal: Pick<EventJournal, 'state' | 'appendMany'>;
    health: HealthRegistry;
    intervalMs?: number;
    run?: GhRunner;
    shouldContinue?: () => boolean;
  }) {
    for (const repo of options.repos) {
      if (!REPO_PATTERN.test(repo)) throw new Error('GitHub repositories must use owner/name');
      options.health.register({ id: `github:${repo}`, label: `GitHub ${repo}`, kind: 'poll', cadenceMs: githubInterval(options.intervalMs) });
    }
  }

  get active(): boolean { return this.#timer !== undefined; }

  start(): void {
    if (this.#timer || this.options.repos.length === 0) return;
    this.options.health.pause(this.options.repos.map((repo) => `github:${repo}`), false);
    this.#timer = setInterval(() => {
      if (this.options.shouldContinue && !this.options.shouldContinue()) { this.stop(true); return; }
      void this.tick();
    }, githubInterval(this.options.intervalMs));
    this.#timer.unref?.();
    void this.tick();
  }

  stop(paused = false): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#generation++;
    if (paused) this.options.health.pause(this.options.repos.map((repo) => `github:${repo}`), true);
  }

  /** Never rejects; failures become source health. */
  async tick(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    const generation = this.#generation;
    try {
      for (const repo of this.options.repos) {
        if (generation !== this.#generation) return;
        await this.#poll(repo, generation);
      }
    } finally { this.#running = false; }
  }

  /** Observed branches of sessions attached to this repository, newest first. */
  branches(repo: string): string[] {
    const sessions = Object.values(this.options.journal.state.sessions)
      .filter((session) => session.repo === repo && session.branch && branchPattern.test(session.branch))
      .sort((a, b) => Date.parse(b.stateAt) - Date.parse(a.stateAt));
    return [...new Set(sessions.map((session) => session.branch!))].slice(0, MAX_BRANCHES);
  }

  /** Conditional GET: a 304 reuses the cached body and costs no rate-limit quota. */
  async #get(path: string, generation: number): Promise<unknown> {
    const cached = this.#cache.get(path);
    const args = ['-H', 'Accept: application/vnd.github+json', ...(cached?.etag ? ['-H', `If-None-Match: ${cached.etag}`] : []), path];
    const result = await (this.options.run ?? ghRunner)(args);
    if (generation !== this.#generation) throw new Stale();
    const response = parseGhResponse(result.stdout);
    if (!response) throw new Error(result.exitCode ? 'gh indisponible ou non authentifié' : 'réponse GitHub illisible');
    if (response.status === 304 && cached) return cached.body;
    if (response.status < 200 || response.status > 299) throw new Error(`GitHub HTTP ${response.status}`);
    this.#cache.set(path, { ...(response.etag ? { etag: response.etag } : {}), body: response.body });
    if (this.#cache.size > 200) this.#cache.delete(this.#cache.keys().next().value!);
    return response.body;
  }

  async #checks(repo: string, sha: string, generation: number) {
    const runs: Run[] = [];
    let total = 0;
    for (let page = 1; page <= MAX_CHECK_PAGES; page++) {
      const parsed = checkRuns.parse(await this.#get(`repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`, generation));
      runs.push(...parsed.check_runs);
      total = Math.max(total, parsed.total_count ?? runs.length);
      if (parsed.check_runs.length < 100 || runs.length >= total) break;
    }
    return ciStatus(runs, runs.length >= total, total);
  }

  async #poll(repo: string, generation: number): Promise<void> {
    const { journal, health } = this.options;
    const id = `github:${repo}`;
    const events: EventInput[] = [];
    const missing: string[] = [];
    const append = () => {
      if (generation !== this.#generation || events.length === 0) return;
      try { journal.appendMany(events.splice(0)); } catch { throw new StorageFailure(); }
    };
    try {
      const { default_branch: defaultBranch } = repository.parse(await this.#get(`repos/${repo}`, generation));
      for (const branch of [...new Set([...this.branches(repo), defaultBranch])]) {
        let head: z.infer<typeof commitSchema>;
        try { head = commitSchema.parse(await this.#get(`repos/${repo}/commits/${encodeURIComponent(branch)}`, generation)); }
        catch (error) {
          if (error instanceof Error && error.message === 'GitHub HTTP 404' && branch !== defaultBranch) { missing.push(branch); continue; }
          throw error;
        }
        const committedAt = head.commit.committer?.date;
        const url = safeLink(head.html_url);
        if (committedAt) events.push({ key: `github:commit:${digest(repo, branch, head.sha)}`, kind: 'github.commit', source: 'github', provenance: 'observed', occurredAt: committedAt,
          data: { repo, branch, sha: head.sha, message: sourceText(head.commit.message, 160), ...(url ? { url } : {}) } });
        const ci = await this.#checks(repo, head.sha, generation);
        if (ci?.at) events.push({ key: `github:ci:${digest(repo, head.sha, ci.status, ci.at, ci.name)}`, kind: 'github.ci', source: 'github', provenance: 'observed', occurredAt: ci.at,
          data: { repo, sha: head.sha, status: ci.status, name: ci.name, ...(ci.url ? { url: ci.url } : {}) } });
      }
      for (const pull of pulls.parse(await this.#get(`repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=10`, generation))) {
        const state = pull.merged_at ? 'merged' as const : pull.state;
        const at = pull.merged_at ?? pull.closed_at ?? pull.updated_at;
        const url = safeLink(pull.html_url);
        events.push({ key: `github:pr:${digest(repo, pull.number, state, at, pull.head.sha)}`, kind: 'github.pr', source: 'github', provenance: 'observed', occurredAt: at,
          data: { repo, number: pull.number, state, title: sourceText(pull.title, 160), headSha: pull.head.sha, headBranch: pull.head.ref,
            ...(state === 'merged' && pull.merge_commit_sha ? { mergeSha: pull.merge_commit_sha } : {}), ...(url ? { url } : {}) } });
      }
      for (const deployment of deployments.parse(await this.#get(`repos/${repo}/deployments?per_page=3`, generation)).slice(0, 3)) {
        const [latest] = statuses.parse(await this.#get(`repos/${repo}/deployments/${deployment.id}/statuses?per_page=1`, generation));
        const url = safeLink(latest?.environment_url) ?? safeLink(latest?.target_url);
        events.push({ key: `github:deploy:${digest(repo, deployment.id, latest?.state ?? 'created', latest?.created_at ?? deployment.created_at)}`, kind: 'github.deploy', source: 'github', provenance: 'observed',
          occurredAt: latest?.created_at ?? deployment.created_at,
          data: { repo, id: deployment.id, environment: sourceText(deployment.environment, 80) || 'environment', state: deployState(latest?.state ?? 'pending'), sha: deployment.sha, ...(url ? { url } : {}) } });
      }
      append();
      if (generation === this.#generation) health.ok(id, missing.length ? `${missing.length} branche(s) observée(s) introuvable(s) sur GitHub` : undefined);
    } catch (error) {
      if (error instanceof Stale || generation !== this.#generation) return;
      // A storage failure is never reported as a successful read.
      if (error instanceof StorageFailure) { health.fail(id, 'journal local indisponible'); return; }
      // Facts read before the failure remain valid; the failure itself stays visible.
      try { append(); } catch { health.fail(id, 'journal local indisponible'); return; }
      health.fail(id, error instanceof z.ZodError ? 'réponse GitHub inattendue' : error instanceof Error ? error.message.slice(0, 80) : 'GitHub indisponible');
    }
  }
}

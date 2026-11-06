import { EventEmitter } from 'node:events';
import type { FSWatcher } from 'node:fs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceStatus } from '../../shared/board.js';
import { isSafeSourceUrl } from '../../shared/events.js';
import type { ObservedSession } from '../../shared/observation.js';
import { EventJournal } from '../events/journal.js';
import { ciStatus, GitHubSource, githubInterval, parseGhResponse, type GhRunner } from './github.js';
import { HealthRegistry } from './health.js';
import { NativeRefresher } from './native.js';

const directories: string[] = [];
const journals: EventJournal[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const journal of journals.splice(0)) journal.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function journal(): EventJournal {
  const directory = mkdtempSync(join(tmpdir(), 'agent-village-sources-test-'));
  directories.push(directory);
  const created = new EventJournal({ directory: join(directory, 'journal') });
  journals.push(created);
  return created;
}
const session = (text: string): ObservedSession => ({ id: 'codex:fictional', tool: 'codex', role: 'lead', state: 'idle', projectKey: '/fictional/root', project: 'Fictional',
  title: 'Fictional', lastActivityAt: '2026-10-01T10:00:00.000Z', history: [{ at: '2026-10-01T10:00:00.000Z', kind: 'report', text }] });

describe('source health', () => {
  it('is stale beyond three cadences, unreachable after a failed attempt, waiting before the first read', () => {
    const now = Date.parse('2026-10-01T12:00:00.000Z');
    const base = { id: 'codex', label: 'Codex', kind: 'poll' as const, cadenceMs: 5_000 };
    expect(sourceStatus(base, now)).toBe('waiting');
    expect(sourceStatus({ ...base, lastOkAt: new Date(now - 14_000).toISOString() }, now)).toBe('ok');
    expect(sourceStatus({ ...base, lastOkAt: new Date(now - 16_000).toISOString() }, now)).toBe('stale');
    expect(sourceStatus({ ...base, lastOkAt: new Date(now - 1_000).toISOString(), lastErrorAt: new Date(now).toISOString() }, now)).toBe('unreachable');
    expect(sourceStatus({ ...base, lastOkAt: new Date(now).toISOString(), lastErrorAt: new Date(now - 1_000).toISOString() }, now)).toBe('ok');
    expect(sourceStatus({ ...base, paused: true }, now)).toBe('paused');
    expect(sourceStatus({ id: 'hook', label: 'Hook', kind: 'push', lastOkAt: new Date(now - 3_600_000).toISOString() }, now)).toBe('ok');
  });
});

describe('native refresher', () => {
  function watchers() {
    const created: { path: string; recursive: boolean; fire: () => void }[] = [];
    const factory = (path: string, recursive: boolean, onChange: () => void) => {
      const emitter = Object.assign(new EventEmitter(), { close: vi.fn() }) as unknown as FSWatcher;
      created.push({ path, recursive, fire: onChange });
      return emitter;
    };
    return { created, factory };
  }

  it('debounces bursts of file changes into one serialized refresh, with a follow-up for changes during a run', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    let text = 'First report.';
    const collector = { roots: { codex: '/fictional/.codex', claude: '/fictional/.claude' }, calls: 0,
      async snapshot() { this.calls++; await new Promise<void>((done) => { release = done; }); return { errors: [], sessions: [session(text)] }; } };
    const events = journal();
    const health = new HealthRegistry();
    const { created, factory } = watchers();
    const refresher = new NativeRefresher({ collector, journal: events, health, watch: factory, debounceMs: 250, pollMs: 5_000 });
    const first = refresher.start();
    expect(created.map((entry) => [entry.path, entry.recursive])).toEqual([
      ['/fictional/.codex/sessions', true], ['/fictional/.codex', false], ['/fictional/.claude/projects', true], ['/fictional/.claude/sessions', false]]);
    release!(); await first;
    expect(collector.calls).toBe(1);
    for (let index = 0; index < 10; index++) created[0]!.fire();
    await vi.advanceTimersByTimeAsync(249);
    expect(collector.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(collector.calls).toBe(2);
    text = 'Second report.';
    created[2]!.fire();
    await vi.advanceTimersByTimeAsync(250); // A change while the second run is still collecting.
    expect(collector.calls).toBe(2);
    release!(); await vi.advanceTimersByTimeAsync(0);
    expect(collector.calls).toBe(3);
    release!(); await vi.advanceTimersByTimeAsync(0);
    expect(Object.values(events.state.updates).map((entry) => entry.text).sort()).toEqual(['First report.', 'Second report.']);
    expect(health.list().find((source) => source.id === 'codex')).toMatchObject({ lastOkAt: expect.any(String) });
    refresher.stop();
  });

  it('keeps a 5-second safety poll without watchers and reports a failing collector with its time', async () => {
    vi.useFakeTimers();
    const collector = { calls: 0, failing: false, async snapshot() { this.calls++; if (this.failing) throw new Error('fictional'); return { errors: [], sessions: [] }; } };
    const health = new HealthRegistry();
    const refresher = new NativeRefresher({ collector, journal: journal(), health, watch: false });
    await refresher.start();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(collector.calls).toBe(3);
    collector.failing = true;
    await vi.advanceTimersByTimeAsync(5_000);
    const codex = health.list().find((source) => source.id === 'codex')!;
    expect(codex).toMatchObject({ lastError: 'collecte locale impossible', lastErrorAt: expect.any(String) });
    expect(sourceStatus(codex, Date.now())).toBe('unreachable');
    refresher.stop();
  });

  it('turns a persistence failure into visible health, never an unhandled rejection or a success', async () => {
    const health = new HealthRegistry();
    const refresher = new NativeRefresher({ collector: { snapshot: async () => ({ sessions: [session('Report.')], errors: [] }) }, watch: false, health,
      journal: { state: journal().state, appendMany() { throw new Error('fictional persistence failure'); } } });
    await expect(refresher.run()).resolves.toBeUndefined();
    const codex = health.list().find((source) => source.id === 'codex')!;
    expect(codex).toMatchObject({ lastError: 'journal local indisponible' });
    expect(codex.lastOkAt).toBeUndefined();
  });

  it('drops a collection that completes after stop()', async () => {
    let complete!: (value: { sessions: ObservedSession[]; errors: string[] }) => void;
    let writes = 0;
    const health = new HealthRegistry();
    const refresher = new NativeRefresher({ collector: { snapshot: () => new Promise((resolve) => { complete = resolve; }) }, watch: false, health, pollMs: 60_000,
      journal: { state: journal().state, appendMany() { writes++; return []; } } });
    const collecting = refresher.start();
    refresher.stop(true);
    complete({ sessions: [session('Late report.')], errors: [] });
    await collecting;
    expect(writes).toBe(0);
    expect(health.list().every((source) => source.paused && !source.lastOkAt)).toBe(true);
  });

  it('pauses when no owner session remains and marks the sources paused', async () => {
    vi.useFakeTimers();
    let active = true;
    const collector = { calls: 0, async snapshot() { this.calls++; return { errors: ['Codex : index local inaccessible'], sessions: [] }; } };
    const health = new HealthRegistry();
    const refresher = new NativeRefresher({ collector, journal: journal(), health, watch: false, shouldContinue: () => active });
    await refresher.start();
    expect(sourceStatus(health.list().find((source) => source.id === 'codex')!, Date.now())).toBe('unreachable');
    expect(sourceStatus(health.list().find((source) => source.id === 'claude')!, Date.now())).toBe('ok');
    active = false;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(collector.calls).toBe(1);
    expect(refresher.active).toBe(false);
    expect(health.list().every((source) => source.paused)).toBe(true);
  });
});

describe('GitHub source', () => {
  const head = (status: number, etag?: string) => `HTTP/2.0 ${status} ${status === 304 ? 'Not Modified' : 'OK'}\r\n${etag ? `Etag: ${etag}\r\n` : ''}Content-Type: application/json\r\n\r\n`;
  function fake(): { run: GhRunner; calls: string[][]; responses: Map<string, string>; etags: Map<string, string> } {
    const calls: string[][] = [];
    const responses = new Map<string, string>();
    const etags = new Map<string, string>();
    const run: GhRunner = async (args) => {
      calls.push([...args]);
      const path = args.at(-1)!;
      const conditional = args.find((arg) => arg.startsWith('If-None-Match: '))?.slice('If-None-Match: '.length);
      const body = responses.get(path.split('?')[0]!);
      if (body === undefined) return { stdout: `${head(404)}{"message":"Not Found"}`, exitCode: 1 };
      if (conditional && conditional === etags.get(path)) return { stdout: head(304, conditional), exitCode: 1 };
      const etag = `"etag-${calls.length}"`;
      etags.set(path, etag);
      return { stdout: `${head(200, etag)}${body}`, exitCode: 0 };
    };
    return { run, calls, responses, etags };
  }
  const repo = 'fictional-org/orchard';
  function respond(responses: Map<string, string>, ci: 'success' | 'failure' | 'in_progress') {
    responses.set(`repos/${repo}`, JSON.stringify({ default_branch: 'main' }));
    responses.set(`repos/${repo}/commits/main`, JSON.stringify({ sha: 'abc1234def', html_url: `https://github.com/${repo}/commit/abc1234def`, commit: { message: 'Add tiles\n\nBody', committer: { date: '2026-10-01T10:00:00Z' } } }));
    responses.set(`repos/${repo}/commits/abc1234def/check-runs`, JSON.stringify({ check_runs: [
      { name: 'unit', status: ci === 'in_progress' ? 'in_progress' : 'completed', conclusion: ci === 'in_progress' ? null : ci, started_at: '2026-10-01T10:01:00Z', completed_at: ci === 'in_progress' ? null : '2026-10-01T10:05:00Z', html_url: `https://github.com/${repo}/runs/1` },
      { name: 'lint', status: 'completed', conclusion: 'success', started_at: '2026-10-01T10:01:00Z', completed_at: '2026-10-01T10:02:00Z' }] }));
    responses.set(`repos/${repo}/pulls`, JSON.stringify([{ number: 4, state: 'closed', title: 'Add tiles', merged_at: '2026-10-01T09:59:00Z', closed_at: '2026-10-01T09:59:00Z', updated_at: '2026-10-01T09:59:00Z',
      html_url: `https://github.com/${repo}/pull/4`, head: { sha: 'fff1234', ref: 'tiles' } }]));
    responses.set(`repos/${repo}/deployments`, JSON.stringify([{ id: 9, sha: 'abc1234def', environment: 'preview', created_at: '2026-10-01T10:06:00Z' }]));
    responses.set(`repos/${repo}/deployments/9/statuses`, JSON.stringify([{ state: 'error', created_at: '2026-10-01T10:07:00Z' }]));
  }

  it('parses gh --include output with its status and ETag', () => {
    expect(parseGhResponse(`${head(200, '"abc"')}{"ok":true}`)).toEqual({ status: 200, etag: '"abc"', body: { ok: true } });
    expect(parseGhResponse(head(304, '"abc"'))).toEqual({ status: 304, etag: '"abc"' });
    expect(parseGhResponse('gh: not logged in')).toBeUndefined();
    expect(githubInterval(5_000)).toBe(30_000);
    expect(githubInterval(600_000)).toBe(60_000);
    expect(githubInterval(undefined)).toBe(45_000);
  });

  it('reads with GET only, reuses ETags, and records observed commit, CI, merge and deployment facts with returned links only', async () => {
    const gh = fake();
    respond(gh.responses, 'in_progress');
    const events = journal();
    const health = new HealthRegistry();
    const source = new GitHubSource({ repos: [repo], journal: events, health, run: gh.run });
    await source.tick();
    const facts = Object.values(events.state.facts);
    expect(facts.find((fact) => fact.kind === 'github.ci')!.data).toMatchObject({ status: 'pending', sha: 'abc1234def' });
    expect(facts.find((fact) => fact.kind === 'github.commit')!.data).toMatchObject({ message: 'Add tiles', url: `https://github.com/${repo}/commit/abc1234def` });
    expect(facts.find((fact) => fact.kind === 'github.pr')!.data).toMatchObject({ state: 'merged', number: 4 });
    expect(facts.find((fact) => fact.kind === 'github.deploy')!.data).toEqual({ repo, id: 9, environment: 'preview', state: 'failure', sha: 'abc1234def' });
    expect(health.list()[0]).toMatchObject({ id: `github:${repo}`, lastOkAt: expect.any(String) });
    const seq = events.seq;
    await source.tick(); // Every endpoint answers 304: nothing changes.
    expect(gh.calls.slice(-6).every((args) => args.some((arg) => arg.startsWith('If-None-Match: ')))).toBe(true);
    expect(events.seq).toBe(seq);
    respond(gh.responses, 'success');
    gh.etags.clear();
    await source.tick();
    expect(events.state.facts[`ci:${repo}:abc1234def`]!.data).toMatchObject({ status: 'success' });
    respond(gh.responses, 'in_progress'); // A late pending with an older timestamp cannot replace success.
    gh.etags.clear();
    await source.tick();
    expect(events.state.facts[`ci:${repo}:abc1234def`]!.data).toMatchObject({ status: 'success' });
  });

  it('polls the observed branches, not only the default branch', async () => {
    const gh = fake();
    respond(gh.responses, 'success');
    gh.responses.set(`repos/${repo}/commits/feature%2Ftiles`, JSON.stringify({ sha: 'bcd2345ef0', commit: { message: 'Feature work', committer: { date: '2026-10-01T10:10:00Z' } } }));
    gh.responses.set(`repos/${repo}/commits/bcd2345ef0/check-runs`, JSON.stringify({ total_count: 1, check_runs: [{ name: 'unit', status: 'completed', conclusion: 'failure', completed_at: '2026-10-01T10:12:00Z' }] }));
    const events = journal();
    events.append({ key: 'session-feature', kind: 'session.observed', source: 'codex-journal', provenance: 'observed', sessionId: 'codex:feature', projectId: 'project-feature',
      occurredAt: '2026-10-01T10:00:00.000Z', data: { tool: 'codex', role: 'lead', state: 'idle', level: 'detected', title: 'Feature', projectName: 'Orchard', repo, branch: 'feature/tiles' } });
    const source = new GitHubSource({ repos: [repo], journal: events, health: new HealthRegistry(), run: gh.run });
    expect(source.branches(repo)).toEqual(['feature/tiles']);
    await source.tick();
    expect(gh.calls.map((args) => args.at(-1))).toContain(`repos/${repo}/commits/feature%2Ftiles`);
    expect(events.state.facts[`commit:${repo}:feature/tiles`]!.data).toMatchObject({ sha: 'bcd2345ef0' });
    expect(events.state.facts[`commit:${repo}:main`]!.data).toMatchObject({ sha: 'abc1234def' });
    expect(events.state.facts[`ci:${repo}:bcd2345ef0`]!.data).toMatchObject({ status: 'failure' });
  });

  it('redacts source text and drops credential-bearing links before persistence, keeping the fact', async () => {
    const gh = fake();
    respond(gh.responses, 'success');
    gh.responses.set(`repos/${repo}/commits/main`, JSON.stringify({ sha: 'abc1234def', html_url: 'https://user:password@example.test/commit?token=fictional-value',
      commit: { message: 'Rotate sk-testsecret12345 in /var/fictional/project', committer: { date: '2026-10-01T10:00:00Z' } } }));
    gh.responses.set(`repos/${repo}/pulls`, JSON.stringify([{ number: 5, state: 'open', title: 'Use ghp_abcdefghijklmnop', merged_at: null, closed_at: null, updated_at: '2026-10-01T09:59:00Z',
      html_url: `https://github.com/${repo}/pull/5?access_token=fictional`, head: { sha: 'fff1234', ref: 'tiles' } }]));
    const events = journal();
    await new GitHubSource({ repos: [repo], journal: events, health: new HealthRegistry(), run: gh.run }).tick();
    const persisted = readFileSync(join(events.directory, 'events.jsonl'), 'utf8');
    expect(events.state.facts[`commit:${repo}:main`]!.data).toMatchObject({ sha: 'abc1234def', message: 'Rotate [redacted-secret] in [redacted-path]' });
    expect(events.state.facts[`commit:${repo}:main`]!.data.url).toBeUndefined();
    expect(persisted).not.toMatch(/sk-testsecret|ghp_abc|user:password|token=fictional|access_token|\/var\/fictional/);
    expect(isSafeSourceUrl('https://github.com/o/r/pull/1')).toBe(true);
    expect(isSafeSourceUrl('https://x.test/a?X-Amz-Signature=1')).toBe(false);
  });

  it('never reports partial pages or unknown conclusions as a green CI', async () => {
    const run = (overrides: Partial<{ status: string; conclusion: string | null }>) => ({ name: 'job', status: 'completed', conclusion: 'success', started_at: '2026-10-01T10:00:00Z', completed_at: '2026-10-01T10:01:00Z', ...overrides });
    expect(ciStatus([run({}), run({})], true)?.status).toBe('success');
    expect(ciStatus([run({}), run({ conclusion: 'stale' })], true)?.status).toBe('unknown');
    expect(ciStatus([run({ conclusion: 'skipped' })], true)?.status).toBe('neutral');
    expect(ciStatus([run({})], false, 250)).toMatchObject({ status: 'unknown', name: '1/250 checks' });
    expect(ciStatus([run({}), run({ conclusion: 'timed_out' })], false, 250)?.status).toBe('failure');
    const gh = fake();
    respond(gh.responses, 'success');
    const page = Array.from({ length: 100 }, (_, index) => ({ ...run({}), name: `job-${index}` }));
    gh.responses.set(`repos/${repo}/commits/abc1234def/check-runs`, JSON.stringify({ total_count: 450, check_runs: page }));
    const events = journal();
    await new GitHubSource({ repos: [repo], journal: events, health: new HealthRegistry(), run: gh.run }).tick();
    expect(gh.calls.filter((args) => args.at(-1)!.includes('/check-runs')).map((args) => args.at(-1))).toEqual([1, 2, 3].map((n) => `repos/${repo}/commits/abc1234def/check-runs?per_page=100&page=${n}`));
    expect(events.state.facts[`ci:${repo}:abc1234def`]!.data).toMatchObject({ status: 'unknown', name: '300/450 checks' });
  });

  it('drops GitHub results that arrive after stop(), and labels storage failures', async () => {
    const gh = fake();
    respond(gh.responses, 'success');
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const events = journal();
    const health = new HealthRegistry();
    const source = new GitHubSource({ repos: [repo], journal: events, health, run: async (args) => { await gate; return gh.run(args); } });
    const ticking = source.tick();
    source.stop(true);
    release();
    await ticking;
    expect(events.seq).toBe(0);
    expect(health.list()[0]!.lastOkAt).toBeUndefined();
    const failing = new HealthRegistry();
    await new GitHubSource({ repos: [repo], journal: { state: events.state, appendMany() { throw new Error('disk'); } }, health: failing, run: gh.run }).tick();
    expect(failing.list()[0]).toMatchObject({ lastError: 'journal local indisponible' });
    expect(failing.list()[0]!.lastOkAt).toBeUndefined();
  });

  it('marks a repository unreachable without inventing facts when gh fails', async () => {
    const events = journal();
    const health = new HealthRegistry();
    const source = new GitHubSource({ repos: [repo], journal: events, health, run: async () => ({ stdout: '', exitCode: 4 }) });
    await source.tick();
    expect(events.seq).toBe(0);
    expect(health.list()[0]).toMatchObject({ lastError: 'gh indisponible ou non authentifié', lastErrorAt: expect.any(String) });
    expect(() => new GitHubSource({ repos: ['not a repo'], journal: events, health })).toThrow('owner/name');
  });
});

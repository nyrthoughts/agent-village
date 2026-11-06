import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../server/board/staticBoard.js';
import type { BoardSnapshot } from './board.js';
import { buildBoardView, claims, projectTimeline, resumeCommand, sessionPresence, sinceLastVisit } from './boardView.js';
import { reduceAll } from './projector.js';
import { ci, commit, observed, sequence, signal, update } from './testEvents.js';
import type { EventInput } from './events.js';

const demo = fixtureSnapshot(JSON.parse(readFileSync(resolve('fixtures/board.demo.json'), 'utf8')));
const demoNow = Date.parse(demo.generatedAt);

function snapshot(inputs: EventInput[], plans: BoardSnapshot['plans'] = {}): BoardSnapshot {
  const state = reduceAll(sequence(inputs));
  return { epoch: 'test-epoch', seq: state.seq, state, plans, health: [], mode: 'native', fictional: false, generatedAt: '2026-10-01T12:00:00.000Z',
    capabilities: { stream: true, editPlans: true, mapProjects: true }, errors: [] };
}
const project = 'project-aaaaaaaaaaaa';
const repo = 'fictional/orchard';
const now = Date.parse('2026-10-01T12:00:00.000Z');

describe('six-project fictional board', () => {
  const view = buildBoardView(demo, demoNow);

  it('lists six projects, one line each, attention first', () => {
    expect(view.rows.map((row) => row.name)).toHaveLength(6);
    const firstQuiet = view.rows.findIndex((row) => row.attention === 0);
    expect(view.rows.slice(firstQuiet).every((row) => row.attention === 0)).toBe(true);
  });

  it('orders attention by type then oldest wait first', () => {
    const order = ['contradiction', 'decision', 'reply', 'validation'];
    const ranks = view.attention.map((item) => order.indexOf(item.type));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const type of order) {
      const since = view.attention.filter((item) => item.type === type).map((item) => Date.parse(item.since));
      expect(since).toEqual([...since].sort((a, b) => a - b));
    }
    expect(view.attention.map((item) => item.reason)).toEqual(expect.arrayContaining(['claim_vs_ci', 'opposed_sessions', 'agent_notification', 'declared_blocker', 'agent_report', 'declared_done']));
  });

  it('keeps hook-only identities unmatched, even when the hint resembles a project name', () => {
    expect(view.unmatched.map((session) => session.id)).toEqual(['claude:demo-unmatched']);
    const quarry = view.rows.find((row) => row.name === 'Quarry Data')!;
    expect(quarry.sessionIds).toContain('claude:demo-qd-1:helper:a1'); // Inherited through its native parent.
  });

  it('shows CI on another commit as such, never as the head state', () => {
    const harbor = view.rows.find((row) => row.name === 'Harbor Sync')!;
    expect(harbor.ladder.find((step) => step.step === 'ci')).toMatchObject({ state: 'other-sha', detail: expect.stringContaining('c2c2c2c') });
    const meadow = view.rows.find((row) => row.name === 'Meadow Docs')!;
    expect(meadow.ladder.every((step) => step.state === 'observed' && step.at)).toBe(true);
    expect(meadow.milestones).toEqual({ validated: 2, total: 2 });
  });

  it('never fabricates source links for fictional facts', () => {
    const urls = view.rows.flatMap((row) => row.ladder.map((step) => step.url)).filter(Boolean);
    expect(urls).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/\d\s?%/);
  });
});

describe('contradictions', () => {
  const feature = { repo, branch: 'feature/orchard' };
  it('proves a contradiction only on the exact SHA the claim cites', () => {
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z', feature),
      update('codex:a', '2026-10-01T11:00:00.000Z', '## Done\n- All tests pass on abc1234.'),
      commit(repo, 'abc1234def0', '2026-10-01T11:05:00Z', 'feature/orchard'),
      ci(repo, 'abc1234def0', '2026-10-01T11:10:00Z', 'failure'),
    ]), now);
    const item = view.attention.find((entry) => entry.reason === 'claim_vs_ci')!;
    expect(item).toMatchObject({ type: 'contradiction', projectId: project });
    expect(item.quotes.map((quote) => quote.provenance)).toEqual(['declared', 'observed']);
    expect(item.quotes[0]!.text).toBe('All tests pass on abc1234.');
  });

  it('never contradicts a success claim on SHA B with a failure on SHA A', () => {
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z', feature),
      update('codex:a', '2026-10-01T11:20:00.000Z', 'Tests passed on def5678.'),
      commit(repo, 'abc1234', '2026-10-01T11:05:00Z', 'feature/orchard'),
      ci(repo, 'abc1234', '2026-10-01T11:10:00Z', 'failure'),
    ]), now);
    expect(view.attention.filter((entry) => entry.type === 'contradiction')).toEqual([]);
  });

  it('shows uncertainty, not a proved contradiction, when the claim cites no SHA', () => {
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z', feature),
      update('codex:a', '2026-10-01T11:00:00.000Z', 'All tests pass.'),
      commit(repo, 'abc1234', '2026-10-01T11:05:00Z', 'feature/orchard'),
      ci(repo, 'abc1234', '2026-10-01T11:10:00Z', 'failure'),
    ]), now);
    expect(view.attention.filter((entry) => entry.type === 'contradiction').map((entry) => entry.reason)).toEqual(['claim_vs_ci_unpinned']);
  });

  it('attributes proofs by repository and observed branch: main CI never proves a feature branch', () => {
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z', feature),
      commit(repo, 'abc1234', '2026-10-01T11:05:00Z', 'main'),
      ci(repo, 'abc1234', '2026-10-01T11:10:00Z', 'failure'),
      { key: 'pr-main', kind: 'github.pr', source: 'github', provenance: 'observed', occurredAt: '2026-10-01T11:06:00Z',
        data: { repo, number: 3, state: 'merged', title: 'Other work', headSha: 'abc1234', headBranch: 'other' } },
    ]), now);
    const steps = Object.fromEntries(view.rows[0]!.ladder.map((step) => [step.step, step.state]));
    expect(steps).toMatchObject({ commit: 'absent', ci: 'absent', merge: 'absent' });
    expect(projectTimeline(snapshot([observed('codex:a', project, '2026-10-01T11:00:00.000Z', feature), commit(repo, 'abc1234', '2026-10-01T11:05:00Z', 'main')]), project)).toEqual([]);
  });

  it('attributes a merged PR, its merge commit CI and deployment to the observed branch', () => {
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z', feature),
      commit(repo, 'aaa1111', '2026-10-01T10:00:00Z', 'feature/orchard'),
      { key: 'pr', kind: 'github.pr', source: 'github', provenance: 'observed', occurredAt: '2026-10-01T10:30:00Z',
        data: { repo, number: 4, state: 'merged', title: 'Orchard', headSha: 'aaa1111', headBranch: 'feature/orchard', mergeSha: 'bbb2222' } },
      { key: 'deploy', kind: 'github.deploy', source: 'github', provenance: 'observed', occurredAt: '2026-10-01T10:40:00Z',
        data: { repo, id: 9, environment: 'production', state: 'success', sha: 'bbb2222' } },
    ]), now);
    expect(Object.fromEntries(view.rows[0]!.ladder.map((step) => [step.step, step.state]))).toMatchObject({ commit: 'observed', merge: 'observed', deploy: 'observed' });
  });

  it('does not flag a claim when the failing CI belongs to an older SHA than the head', () => {
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z', { repo, branch: 'main' }),
      update('codex:a', '2026-10-01T11:00:00.000Z', 'Tests pass now.'),
      ci(repo, 'old1234', '2026-10-01T10:00:00Z', 'failure'),
      commit(repo, 'new5678', '2026-10-01T11:05:00Z'),
      ci(repo, 'new5678', '2026-10-01T11:10:00Z', 'success'),
    ]), now);
    expect(view.attention.some((entry) => entry.type === 'contradiction')).toBe(false);
    expect(view.rows[0]!.ladder.find((step) => step.step === 'ci')).toMatchObject({ state: 'observed' });
  });

  it('never shows partial or unknown CI as green', () => {
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z', { repo, branch: 'main' }),
      commit(repo, 'new5678', '2026-10-01T11:05:00Z'),
      ci(repo, 'new5678', '2026-10-01T11:10:00Z', 'unknown'),
    ]), now);
    expect(view.rows[0]!.ladder.find((step) => step.step === 'ci')).toMatchObject({ state: 'inconclusive' });
  });

  it('ignores negated wording instead of reading it as success or failure', () => {
    expect([...claims('Tests are not passing.').success]).toEqual([]);
    expect([...claims('No tests failed.').failure]).toEqual([]);
    expect([...claims('Les tests ne passent pas.').success]).toEqual([]);
    expect([...claims("The build isn't green yet.").success]).toEqual([]);
    expect([...claims('Build OK, no warnings.').success]).toEqual(['checks']);
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z'), observed('codex:b', project, '2026-10-01T11:00:00.000Z'),
      update('codex:a', '2026-10-01T11:00:00.000Z', 'Tests are not passing.'), update('codex:b', '2026-10-01T11:30:00.000Z', 'No tests failed.'),
    ]), now);
    expect(view.attention.filter((entry) => entry.reason === 'opposed_sessions')).toEqual([]);
  });

  it('flags two sessions of one project that declare opposite outcomes', () => {
    const view = buildBoardView(snapshot([
      observed('codex:a', project, '2026-10-01T11:00:00.000Z'),
      observed('codex:b', project, '2026-10-01T11:00:00.000Z'),
      update('codex:a', '2026-10-01T11:00:00.000Z', 'The build is green.'),
      update('codex:b', '2026-10-01T11:30:00.000Z', 'The build fails on the parser.'),
    ]), now);
    expect(view.attention.filter((entry) => entry.reason === 'opposed_sessions')).toHaveLength(1);
  });

  it('reads claims per topic and cancels mixed statements', () => {
    expect([...claims('Tests pass locally but CI is red.').success]).toEqual([]);
    expect([...claims('Déployé en production.').success]).toEqual(['deploy']);
    expect([...claims('Les tests échouent sur Linux.').failure]).toEqual(['checks']);
    expect([...claims('All checks pass. Deployment failed.').success]).toEqual(['checks']);
  });
});

describe('attention sources', () => {
  it('asks for a decision when an agent notifies and for a reply after a recent report', () => {
    const view = buildBoardView(snapshot([
      observed('claude:n', project, '2026-10-01T11:00:00.000Z', { tool: 'claude' }),
      signal('claude:n', '2026-10-01T11:50:00.000Z', 'waiting', { hookEvent: 'Notification' }),
      observed('codex:r', project, '2026-10-01T11:00:00.000Z'),
      update('codex:r', '2026-10-01T11:40:00.000Z', 'Should I keep the scope minimal?'),
    ]), now);
    expect(view.attention.map((item) => item.reason).sort()).toEqual(['agent_notification', 'agent_report']);
  });

  it('asks for validation only when a declared completion is newer than unvalidated plan milestones', () => {
    const inputs = [observed('codex:v', project, '2026-10-01T11:00:00.000Z'), update('codex:v', '2026-10-01T11:00:00.000Z', '## Done\n- Export finished.')];
    const plan = (validated: boolean, updatedAt: string) => ({ [project]: { objective: 'Goal', revision: 1, updatedAt,
      milestones: [validated ? { id: 'm', title: 'Export', validated: true, note: 'Checked', validatedAt: updatedAt, validatedBy: 'owner' as const } : { id: 'm', title: 'Export', validated: false, note: '' }] } });
    expect(buildBoardView(snapshot(inputs, plan(false, '2026-10-01T10:00:00.000Z')), now).attention.map((item) => item.reason)).toEqual(['declared_done']);
    expect(buildBoardView(snapshot(inputs, plan(true, '2026-10-01T10:00:00.000Z')), now).attention).toEqual([]);
    expect(buildBoardView(snapshot(inputs, plan(false, '2026-10-01T11:30:00.000Z')), now).attention).toEqual([]);
  });
});

describe('attention without hidden expiry', () => {
  const old = '2026-08-01T11:00:00.000Z';
  it('keeps an unanswered notification and a declared blocker until a newer fact resolves them', () => {
    const inputs = [observed('claude:n', project, old, { tool: 'claude', state: 'waiting' }), signal('claude:n', old, 'waiting', { hookEvent: 'Notification' }),
      observed('codex:b', project, old), update('codex:b', old, '## Blocked\n- Owner approval pending.')];
    expect(buildBoardView(snapshot(inputs), now).attention.map((item) => item.reason).sort()).toEqual(['agent_notification', 'declared_blocker']);
    const resolved = [...inputs, signal('claude:n', '2026-10-01T11:00:00.000Z', 'working', { hookEvent: 'UserPromptSubmit' }),
      update('codex:b', '2026-10-01T11:00:00.000Z', 'Please continue with option A.', 'request')];
    expect(buildBoardView(snapshot(resolved), now).attention.filter((item) => item.type === 'decision')).toEqual([]);
  });

  it('keeps a project blocked when another session reports later without a blocker', () => {
    const view = buildBoardView(snapshot([observed('codex:blocked', project, old), update('codex:blocked', old, '## Blocked\n- Owner approval pending.'),
      observed('codex:other', project, '2026-10-01T11:00:00.000Z'), update('codex:other', '2026-10-01T11:00:00.000Z', '## Done\n- Independent task added.')]), now);
    expect(view.rows[0]!.status.kind).toBe('blocked');
  });

  it('keeps a completed report actionable when no ledger plan exists', () => {
    const view = buildBoardView(snapshot([observed('codex:d', project, old), update('codex:d', old, '## Done\n- Prototype added.')]), now);
    expect(view.attention.map((item) => item.reason)).toEqual(['declared_done']);
  });

  it('never treats future or stale activity as current work, and asks nothing of an unconfirmed role', () => {
    const future = buildBoardView(snapshot([observed('codex:f', project, new Date(now + 30_000).toISOString(), { state: 'working', level: 'confirmed' })]), now);
    expect(future.rows[0]!.status.kind).not.toBe('working');
    const stale = snapshot([signal('claude:s', '2026-10-01T09:00:00.000Z', 'working')]).state.sessions['claude:s']!;
    expect(sessionPresence(stale, now)).toEqual({ state: 'unknown', level: 'detected', current: false });
    expect(sessionPresence(stale, Date.parse('2026-10-01T09:01:00.000Z'))).toMatchObject({ state: 'working', level: 'recent', current: true });
    const unknownRole = buildBoardView(snapshot([observed('openclaw:u', project, old, { role: 'unknown' }), update('openclaw:u', old, 'Something happened.')]), now);
    expect(unknownRole.attention).toEqual([]);
  });

  it('reserves milestone counts for the owner ledger; YAML proofs are counted separately', () => {
    const view = buildBoardView(snapshot([{ key: 'yaml-task', kind: 'yaml.task', source: 'yaml', provenance: 'verified', occurredAt: old, projectId: project,
      data: { taskId: 'task-one', projectName: 'Fictional', objective: 'Objective', title: 'A task', declaredStatus: 'verified', effectiveStatus: 'verified',
        verifiedCommit: true, verifiedReview: false, warnings: [], verifiedSha: 'abc1234' } }]), now);
    expect(view.rows[0]!.milestones).toBeUndefined();
    expect(view.rows[0]!.yamlProofs).toEqual({ verified: 1, total: 1 });
    expect(view.rows[0]!.ladder.find((step) => step.step === 'commit')).toMatchObject({ state: 'observed', provenance: 'verified', detail: 'abc1234 · A task' });
  });
});

describe('since last visit', () => {
  const inputs = [
    observed('codex:a', project, '2026-10-01T10:00:00.000Z'),
    update('codex:a', '2026-10-01T10:00:00.000Z', 'Asked something', 'request'),
    update('codex:a', '2026-10-01T10:05:00.000Z', 'First report.'),
    update('codex:a', '2026-10-01T11:05:00.000Z', 'Second report.'),
  ];
  const board = snapshot(inputs);

  it('shows the last 24 hours on a first visit and folds requests and state changes', () => {
    const result = sinceLastVisit(board, undefined, now);
    expect(result.firstVisit).toBe(true);
    expect(result.groups[0]!.significant.map((entry) => entry.text)).toEqual(['Second report.', 'First report.']);
    expect(result.groups[0]!.folded).toBe(2);
  });

  it('uses global and per-project sequence marks, and resets for another journal epoch', () => {
    expect(sinceLastVisit(board, { epoch: 'test-epoch', global: 3, projects: {} }, now).groups[0]!.significant.map((entry) => entry.text)).toEqual(['Second report.']);
    expect(sinceLastVisit(board, { epoch: 'test-epoch', global: 1, projects: { [project]: 4 } }, now).groups).toEqual([]);
    expect(sinceLastVisit(board, { epoch: 'older-epoch', global: 4, projects: {} }, now).firstVisit).toBe(true);
  });
});

describe('timeline and resume', () => {
  it('orders the sourced timeline by occurrence, newest first, with provenance', () => {
    const board = snapshot([observed('codex:a', project, '2026-10-01T10:00:00.000Z', { repo, branch: 'main' }), update('codex:a', '2026-10-01T11:00:00.000Z', 'Later report.'),
      commit(repo, 'abc1234', '2026-10-01T10:20:00Z'), ci(repo, 'abc1234', '2026-10-01T10:30:00Z', 'success'), update('codex:a', '2026-10-01T09:00:00.000Z', 'Earlier report.')]);
    expect(projectTimeline(board, project).map((entry) => [entry.kind, entry.provenance])).toEqual([['report', 'declared'], ['ci', 'observed'], ['commit', 'observed'], ['report', 'declared']]);
  });

  it('builds a copy-only resume command, quoting the directory and refusing unsafe identifiers', () => {
    const base = snapshot([observed('claude:0b1c2d3e-aaaa', project, '2026-10-01T10:00:00.000Z', { tool: 'claude', cwd: "/work/it's here" })]).state.sessions['claude:0b1c2d3e-aaaa'];
    expect(resumeCommand(base)).toBe(`cd '/work/it'\\''s here' && claude --resume 0b1c2d3e-aaaa`);
    expect(resumeCommand({ ...base!, id: 'claude:x;rm -rf' })).toBeUndefined();
    expect(resumeCommand({ ...base!, role: 'helper' })).toBeUndefined();
    expect(resumeCommand({ ...base!, id: 'codex:12345678-abcd', cwd: undefined })).toBe('codex resume 12345678-abcd');
  });
});

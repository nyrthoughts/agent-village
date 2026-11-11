import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { LocalSessions } from './localSessions.js';
import { mergeLiveSessions } from './projectObserver.js';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

it('discovers an existing Claude tmux session without waiting for a new hook', async () => {
  const home = await mkdtemp(join(tmpdir(), 'village-sessions-')); directories.push(home);
  await mkdir(join(home, '.claude/sessions'), { recursive: true });
  await mkdir(join(home, '.claude/projects/project'), { recursive: true });
  await writeFile(join(home, '.claude/sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: 'abc', cwd: '/repo', status: 'busy', tmux: 'work:@1.%2', name: 'Connector', updatedAt: Date.now() }));
  await writeFile(join(home, '.claude/projects/project/abc.jsonl'), JSON.stringify({ cwd: '/repo', type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Tests passed.' }] } }) + '\n');
  const source = new LocalSessions({ home, aliases: { 'session:claude:abc': 'Product Feedback' } });
  const result = await source.snapshot();
  const session = result.sessions.find((entry) => entry.id === 'claude:abc');
  expect(session?.summary).toBe('Tests passed.');
  expect(session?.terminal).toBe('work:@1.%2');
  expect(session?.state).toBe('working');
  expect(session?.project).toBe('Product Feedback');
  expect(session?.activityEvidence).toMatchObject({ level: 'confirmed', source: 'claude-process' });
  // A tool that is not installed is reported as an unavailable source, not as an error.
  expect(result.errors).toEqual([]);
  expect(result.sources).toEqual([
    expect.objectContaining({ id: 'codex', status: 'unavailable', rootsFound: 0, rootsChecked: 1, sessions: 0 }),
    expect.objectContaining({ id: 'claude', status: 'supported', rootsFound: 1, sessions: 1 }),
    expect.objectContaining({ id: 'gemini', status: 'unavailable', experimental: true }),
  ]);
});

it('reports an existing Codex root whose index and rollouts are both unreadable', async () => {
  const home = await mkdtemp(join(tmpdir(), 'village-codex-empty-')); directories.push(home);
  await mkdir(join(home, '.codex'), { recursive: true });
  const result = await new LocalSessions({ home }).snapshot();
  expect(result.errors).toContain('Codex : index local inaccessible');
  expect(result.sources[0]).toMatchObject({ id: 'codex', status: 'supported', rootsFound: 1 });
});

it('reads real Codex index rows read-only and restores history after observer restart', async () => {
  const home = await mkdtemp(join(tmpdir(), 'village-codex-')); directories.push(home);
  await mkdir(join(home, '.codex/sessions'), { recursive: true });
  const journal = join(home, '.codex/sessions/thread.jsonl');
  const at = new Date().toISOString();
  await writeFile(journal, [
    { timestamp: at, type: 'event_msg', payload: { type: 'task_started' } },
    { timestamp: at, type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Connecting now.' }] } },
  ].map((row) => JSON.stringify(row)).join('\n'));
  const database = join(home, '.codex/state_5.sqlite');
  execFileSync('sqlite3', [database, `CREATE TABLE threads(id,name,title,cwd,rollout_path,updated_at,archived,agent_path); INSERT INTO threads VALUES('current','Current task','','/repo','${journal}',strftime('%s','now'),0,NULL);`]);
  const first = await new LocalSessions({ home }).snapshot();
  const restarted = await new LocalSessions({ home }).snapshot();
  expect(first.sessions[0]?.id).toBe('codex:current');
  expect(first.sessions[0]?.state).toBe('working');
  expect(first.sessions[0]?.activityEvidence).toMatchObject({ level: 'recent', source: 'codex-journal' });
  expect(first.errors).toContain('Codex : index des sous-agents inaccessible');
  expect(first.coverage).toContain('Codex : sous-agents partiellement ou non détectés ; la collecte des parents reste disponible.');
  expect(restarted.sessions[0]?.history).toEqual(first.sessions[0]?.history);
  expect(restarted.sessions[0]?.summary).toBe('Connecting now.');
});

async function codexFamily(extraSql: string) {
  const home = await mkdtemp(join(tmpdir(), 'village-codex-family-')); directories.push(home);
  await mkdir(join(home, '.codex/sessions'), { recursive: true });
  const journal = join(home, '.codex/sessions/parent.jsonl');
  const childJournal = join(home, '.codex/sessions/child.jsonl');
  await writeFile(journal, JSON.stringify({ type: 'event_msg', timestamp: new Date().toISOString(), payload: { type: 'task_started' } }));
  await writeFile(childJournal, JSON.stringify({ type: 'response_item', timestamp: new Date().toISOString(), payload: {
    type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'CHILD_TRANSCRIPT_MUST_NOT_BE_READ' }],
  } }));
  const database = join(home, '.codex/state_5.sqlite');
  execFileSync('sqlite3', [database, `
    CREATE TABLE threads(id,name,title,cwd,rollout_path,updated_at,archived,agent_path);
    CREATE TABLE thread_spawn_edges(parent_thread_id TEXT,child_thread_id TEXT PRIMARY KEY,status TEXT);
    INSERT INTO threads VALUES('parent','Parent task','','/repo/alpha','${journal}',strftime('%s','now'),0,'/root');
    INSERT INTO threads VALUES('child','Review helper','','/different/repo','${childJournal}',strftime('%s','now'),0,'/root/review');
    INSERT INTO thread_spawn_edges VALUES('parent','child','open');
    ${extraSql}
  `]);
  return { home, source: new LocalSessions({ home, aliases: { 'session:codex:parent': 'Alpha' } }) };
}

it('detects child metadata without reading child transcripts or treating open edges as active work', async () => {
  const test = await codexFamily(`
    INSERT INTO threads VALUES('old','Older helper','','/wrong/project','unused',strftime('%s','now')-600,1,'/root/old');
    INSERT INTO threads VALUES('nested','Nested helper','','/another/project','unused',strftime('%s','now'),0,'/root/review/nested');
    INSERT INTO thread_spawn_edges VALUES('parent','old','open'),('child','nested','open'),('nested','parent','open');
  `);
  const result = await test.source.snapshot();
  const child = result.sessions.find((entry) => entry.id === 'codex:child');
  const old = result.sessions.find((entry) => entry.id === 'codex:old');
  const nested = result.sessions.find((entry) => entry.id === 'codex:nested');
  expect(child).toMatchObject({ role: 'helper', parentId: 'codex:parent', project: 'Alpha', projectKey: 'alias:Alpha',
    state: 'unknown', history: [], activityEvidence: { level: 'recent', source: 'codex-index' } });
  expect(old).toMatchObject({ role: 'helper', parentId: 'codex:parent', state: 'unknown',
    activityEvidence: { level: 'detected', source: 'codex-index' } });
  expect(nested).toMatchObject({ role: 'helper', parentId: 'codex:child', project: 'Alpha',
    attachedTaskId: child?.attachedTaskId, history: [] });
  expect(result.sessions.filter((entry) => entry.role === 'helper')).toHaveLength(3);
  expect(result.sessions.filter((entry) => entry.id === 'codex:parent')).toHaveLength(1);
  expect(JSON.stringify(result.sessions)).not.toContain('CHILD_TRANSCRIPT_MUST_NOT_BE_READ');
  expect(result.coverage).toContain('Claude : sous-agents issus des hooks reçus depuis le démarrage ; conservation 30 minutes, historique incomplet.');
});

it('bounds child discovery to 200 metadata rows and reports incomplete coverage', async () => {
  const test = await codexFamily(`
    WITH RECURSIVE nums(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM nums WHERE n<205)
    INSERT INTO threads SELECT 'helper-'||n,'Helper '||n,'','/other','unused',strftime('%s','now'),0,'/root/helper-'||n FROM nums;
    INSERT INTO thread_spawn_edges SELECT 'parent',id,'open' FROM threads WHERE id LIKE 'helper-%';
  `);
  const result = await test.source.snapshot();
  expect(result.sessions.filter((entry) => entry.role === 'helper')).toHaveLength(200);
  expect(result.coverage).toContain('Codex : couverture des sous-agents limitée par le plafond de collecte.');
});

it('does not confirm a stale Claude busy record merely because its process still exists', async () => {
  const home = await mkdtemp(join(tmpdir(), 'village-claude-stale-')); directories.push(home);
  await mkdir(join(home, '.claude/sessions'), { recursive: true });
  await mkdir(join(home, '.claude/projects/project'), { recursive: true });
  await writeFile(join(home, '.claude/sessions', `${process.pid}.json`), JSON.stringify({
    pid: process.pid, sessionId: 'stale', cwd: '/repo', status: 'busy', updatedAt: Date.now() - 600_000,
  }));
  await writeFile(join(home, '.claude/projects/project/stale.jsonl'), JSON.stringify({
    type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: 'Recent report, stale process state.' },
  }));
  const result = await new LocalSessions({ home }).snapshot();
  expect(result.sessions.find((entry) => entry.id === 'claude:stale')).toMatchObject({ state: 'unknown',
    activityEvidence: { level: 'detected', source: 'claude-process' } });
});

it('lets a later Stop supersede a fresh busy declaration even when the process is polled afterward', async () => {
  const home = await mkdtemp(join(tmpdir(), 'village-claude-stop-')); directories.push(home);
  await mkdir(join(home, '.claude/sessions'), { recursive: true });
  await mkdir(join(home, '.claude/projects/project'), { recursive: true });
  const busyAt = new Date(Date.now() - 60_000).toISOString();
  const stopAt = new Date(Date.now() - 30_000).toISOString();
  await writeFile(join(home, '.claude/sessions', `${process.pid}.json`), JSON.stringify({
    pid: process.pid, sessionId: 'stopped', cwd: '/repo', status: 'busy', updatedAt: busyAt,
  }));
  await writeFile(join(home, '.claude/projects/project/stopped.jsonl'), JSON.stringify({
    type: 'assistant', timestamp: busyAt, message: { role: 'assistant', content: 'Working before Stop.' },
  }));
  const snapshot = await new LocalSessions({ home }).snapshot();
  const result = mergeLiveSessions(snapshot.sessions, [{ id: 'claude:stopped', tool: 'claude', role: 'lead',
    state: 'waiting', lastActivityAt: stopAt,
    activityEvidence: { level: 'recent', source: 'claude-hook', observedAt: stopAt } }]);
  expect(result.find((entry) => entry.id === 'claude:stopped')).toMatchObject({ state: 'waiting',
    activityEvidence: { level: 'recent', source: 'claude-hook', observedAt: stopAt } });
  expect(snapshot.sessions.find((entry) => entry.id === 'claude:stopped')?.activityEvidence?.observedAt).toBe(busyAt);
});

it('labels Claude transcript history as journal observation rather than a hook or confirmed process', async () => {
  const home = await mkdtemp(join(tmpdir(), 'village-claude-history-')); directories.push(home);
  await mkdir(join(home, '.claude/projects/project'), { recursive: true });
  await writeFile(join(home, '.claude/projects/project/history.jsonl'), JSON.stringify({
    cwd: '/repo', type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: 'A recent historical report.' },
  }));
  const result = await new LocalSessions({ home }).snapshot();
  expect(result.sessions.find((entry) => entry.id === 'claude:history')).toMatchObject({ state: 'idle',
    activityEvidence: { level: 'recent', source: 'claude-journal' } });
});

it('caps helper depth and never duplicates a cyclic edge', async () => {
  const test = await codexFamily(`
    WITH RECURSIVE nums(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM nums WHERE n<10)
    INSERT INTO threads SELECT 'deep-'||n,'Deep '||n,'','/other','unused',strftime('%s','now'),0,'/root/deep-'||n FROM nums;
    INSERT INTO thread_spawn_edges SELECT CASE WHEN id='deep-1' THEN 'child' ELSE 'deep-'||(CAST(substr(id,6) AS INTEGER)-1) END,id,'open' FROM threads WHERE id LIKE 'deep-%';
  `);
  const result = await test.source.snapshot();
  expect(result.sessions.filter((entry) => entry.role === 'helper')).toHaveLength(8);
  expect(result.sessions.some((entry) => entry.id === 'codex:deep-8')).toBe(false);
  expect(result.coverage).toContain('Codex : couverture des sous-agents limitée par le plafond de collecte.');
});

it('resolves projects through the owner manifest, recorded Codex remotes and the Unassigned inbox', async () => {
  const home = await mkdtemp(join(tmpdir(), 'village-resolve-')); directories.push(home);
  const privateDir = join(home, 'private');
  await mkdir(join(home, '.codex/sessions'), { recursive: true });
  await mkdir(join(home, '.claude/projects/project'), { recursive: true });
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  const at = new Date().toISOString();
  const journal = join(home, '.codex/sessions/clone.jsonl');
  await writeFile(journal, [
    { timestamp: at, type: 'session_meta', payload: { id: 'clone', cwd: '/w/removed', git: { repository_url: 'https://demo:fake-token@github.com/demo-org/warehouse.git' } } },
    { timestamp: at, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Recount stock' }] } },
  ].map((row) => JSON.stringify(row)).join('\n'));
  const database = join(home, '.codex/state_5.sqlite');
  execFileSync('sqlite3', [database, `
    CREATE TABLE threads(id,name,title,cwd,rollout_path,updated_at,archived,agent_path,git_origin_url);
    CREATE TABLE thread_spawn_edges(parent_thread_id TEXT,child_thread_id TEXT PRIMARY KEY,status TEXT);
    INSERT INTO threads VALUES('indexed','Indexed task','','/w/also-removed','${journal}',strftime('%s','now'),0,NULL,'git@github.com:demo-org/warehouse.git');
    INSERT INTO threads VALUES('clone','From metadata','','/w/removed','${journal}',strftime('%s','now'),0,NULL,NULL);
    INSERT INTO threads VALUES('helper','Helper','','/w/other','unused',strftime('%s','now'),0,'/root/helper',NULL);
    INSERT INTO thread_spawn_edges VALUES('clone','helper','open');
  `]);
  const claude = (id: string, cwd: string | undefined, text: string) => writeFile(join(home, '.claude/projects/project', `${id}.jsonl`),
    JSON.stringify({ ...(cwd ? { cwd } : {}), type: 'user', timestamp: at, message: { role: 'user', content: text } }));
  await claude('home-chat', home, 'Groceries list');
  await claude('titled', home, 'Billing: draft invoice email');
  await claude('nowhere', undefined, 'Which folder am I in?');
  const manifestPath = join(privateDir, 'projects.yaml');
  await writeFile(manifestPath, 'projects:\n  - name: Billing\n    titles: ["^billing:"]\n    links:\n      - { title: Pricing brainstorm, url: "https://claude.ai/chat/demo", source: claude-app }\n', { mode: 0o600 });

  const result = await new LocalSessions({ home, manifestPath }).snapshot();
  const byId = (id: string) => result.sessions.find((entry) => entry.id === id);
  expect(result.errors.filter((error) => error.startsWith('Manifeste'))).toEqual([]);
  expect(byId('codex:indexed')).toMatchObject({ projectKey: 'remote:github.com/demo-org/warehouse', project: 'warehouse', matchedBy: 'remote', matchVia: 'recorded' });
  expect(byId('codex:clone')).toMatchObject({ projectKey: 'remote:github.com/demo-org/warehouse', matchedBy: 'remote', matchVia: 'recorded' });
  expect(byId('codex:helper')).toMatchObject({ role: 'helper', projectKey: 'remote:github.com/demo-org/warehouse', matchedBy: 'remote' });
  expect(byId('claude:home-chat')).toMatchObject({ projectKey: 'unassigned', matchedBy: 'unassigned', matchVia: 'catch-all', matchDetail: '~' });
  expect(byId('claude:nowhere')).toMatchObject({ projectKey: 'unassigned', matchVia: 'no-cwd' });
  expect(byId('claude:titled')).toMatchObject({ projectKey: 'alias:Billing', project: 'Billing', matchedBy: 'rule', matchVia: 'title' });
  expect(result.declared).toEqual([{ key: 'alias:Billing', name: 'Billing', links: [{ title: 'Pricing brainstorm', url: 'https://claude.ai/chat/demo', source: 'claude-app' }] }]);
  expect(result.moves).toEqual(expect.arrayContaining([{ from: '/w/removed', to: 'remote:github.com/demo-org/warehouse' }]));
  const exported = JSON.stringify(result.sessions);
  expect(exported).not.toContain('fake-token');
  expect(exported).not.toContain('repository');
  expect(exported).not.toContain('firstRequest');

  await writeFile(manifestPath, 'projects:\n  - name: Billing\n    titles: ["(broken"]\n');
  await utimes(manifestPath, new Date(), new Date(Date.now() + 10_000));
  const broken = await new LocalSessions({ home, manifestPath }).snapshot();
  expect(broken.errors).toContain('Manifeste projects.yaml : projects.0.titles.0: invalid regular expression');
  expect(broken.sessions.find((entry) => entry.id === 'claude:titled')?.projectKey).toBe('unassigned');
  expect(broken.sessions.find((entry) => entry.id === 'codex:indexed')?.matchedBy).toBe('remote');
});

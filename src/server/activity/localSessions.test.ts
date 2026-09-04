import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { LocalSessions } from './localSessions.js';

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
  expect(result.errors).toContain('Codex : index local inaccessible');
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
  expect(restarted.sessions[0]?.history).toEqual(first.sessions[0]?.history);
  expect(restarted.sessions[0]?.summary).toBe('Connecting now.');
});

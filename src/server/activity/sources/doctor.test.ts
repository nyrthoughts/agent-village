import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeClaudeHooks } from '../claudeHooks.js';
import { runSourcesDoctor } from './doctor.js';
import { geminiProjectHash } from './gemini.js';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const SECRET_TEXT = 'FICTIONAL_TRANSCRIPT_TEXT_MUST_NOT_PRINT';
const now = () => new Date().toISOString();
const jsonl = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n');

/** A fictional home with Codex, Claude Code, Gemini CLI and a desktop-app folder. */
async function fixture(): Promise<string> {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'village-doctor-'))); directories.push(home);
  const day = join(home, '.codex/sessions/2026/11/09');
  await mkdir(day, { recursive: true });
  await writeFile(join(day, 'rollout-a.jsonl'), jsonl([
    { timestamp: now(), type: 'session_meta', payload: { id: 'a', originator: 'codex_cli_rs', source: 'cli', cwd: '/w/app', instructions: SECRET_TEXT } },
    { timestamp: now(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: SECRET_TEXT }] } },
    { timestamp: now(), type: 'event_msg', payload: { type: 'exec_approval_request', command: [SECRET_TEXT] } },
  ]));
  await writeFile(join(day, 'rollout-b.jsonl'), jsonl([
    { timestamp: now(), type: 'session_meta', payload: { id: 'b', originator: 'Codex Desktop', source: 'vscode', cwd: '/w/app' } },
  ]));
  await writeFile(join(day, 'rollout-broken.jsonl'), '{ not json');
  await mkdir(join(home, '.claude/projects/demo'), { recursive: true });
  await writeFile(join(home, '.claude/projects/demo/c1.jsonl'), jsonl([
    { cwd: '/w/site', entrypoint: 'cli', type: 'user', timestamp: now(), message: { role: 'user', content: SECRET_TEXT } },
  ]));
  await writeFile(join(home, '.claude/projects/demo/c2.jsonl'), jsonl([
    { cwd: '/w/site', entrypoint: 'claude-vscode', type: 'assistant', timestamp: now(), message: { role: 'assistant', content: SECRET_TEXT } },
  ]));
  const settings = mergeClaudeHooks({}, 'http://127.0.0.1:4180/api/hooks/claude', '/private/owner/ingestion.header');
  delete settings.hooks.PermissionRequest;
  await writeFile(join(home, '.claude/settings.json'), JSON.stringify(settings));
  for (const [folder, id] of [[geminiProjectHash('/w/site'), 'known'], [geminiProjectHash('/nowhere/known'), 'lost']] as const) {
    await mkdir(join(home, '.gemini/tmp', folder, 'chats'), { recursive: true });
    await writeFile(join(home, '.gemini/tmp', folder, 'chats', `session-${id}.json`), JSON.stringify({ sessionId: id, startTime: now(), lastUpdated: now(),
      messages: [{ type: 'user', timestamp: now(), content: SECRET_TEXT }] }));
  }
  await mkdir(join(home, '.config/Claude/sub'), { recursive: true });
  await writeFile(join(home, '.config/Claude/config.json'), JSON.stringify({ note: SECRET_TEXT }));
  await writeFile(join(home, '.config/Claude/sub/history.jsonl'), SECRET_TEXT);
  return home;
}

describe('sources doctor', () => {
  it('reports roots, counts, origins, hooks, Gemini hashes and desktop folders without any conversation text', async () => {
    const home = await fixture();
    const output = await runSourcesDoctor({ home, env: { VILLAGE_CODEX_HOMES: '~/missing-codex' }, platform: 'linux' });
    expect(output).toContain('root ~/.codex (default) · exists');
    expect(output).toContain('root ~/missing-codex (VILLAGE_CODEX_HOMES) · missing');
    expect(output).toContain('index state_5.sqlite: missing (rollout files are read directly)');
    expect(output).toContain('rollout files (7 days): 3 · parse failures: 1');
    expect(output).toMatch(/origins: .*cli ×1/);
    expect(output).toContain('raw originator/source: (none)/(none) ×1, Codex Desktop/vscode ×1, codex_cli_rs/cli ×1');
    expect(output).toContain('approval-request events (exec_approval_request, apply_patch_approval_request): 1 in 1 of 3 recent rollouts');
    expect(output).toContain('journals (7 days): 2 · parse failures: 0 · process records: 0');
    expect(output).toContain('raw entrypoint: claude-vscode ×1, cli ×1');
    expect(output).toMatch(/hooks: installed for 10\/11 events · missing: PermissionRequest · run npm run connect:claude/);
    expect(output).toContain('project folders: 2 (2 hashed, 0 other names)');
    expect(output).toContain('hashes resolved: 1 of 2 · unresolved: 1');
    expect(output).toContain('~/.config/Claude · exists · 1 *.jsonl, 1 *.json');
    expect(output).toContain('~/.config/Codex · missing');
    expect(output).toMatch(/not checked on this computer: darwin \(~\/Library\/Application Support\/Claude.*win32 \(%APPDATA%\\Claude/);
    expect(output).not.toContain(SECRET_TEXT);
    expect(output).not.toContain(home);
  });

  it('runs as npm run sources:doctor against a given home', async () => {
    const home = await fixture();
    const tsx = resolve('node_modules/.bin/tsx');
    const output = execFileSync(tsx, ['scripts/sources-doctor.ts', '--home', home], { encoding: 'utf8',
      env: { PATH: process.env.PATH, VILLAGE_AUTH_DIR: join(home, 'private') } });
    expect(output).toContain('Agent Village sources doctor');
    expect(output).toContain('projects.yaml: absent');
    expect(output).toContain('Gemini CLI [experimental]');
    expect(output).not.toContain(SECRET_TEXT);
    expect(output).not.toContain(home);
  });
});

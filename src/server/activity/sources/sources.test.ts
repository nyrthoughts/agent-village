import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalSessions } from '../localSessions.js';
import { parseTranscript } from '../projectObserver.js';
import { claudeSource } from './claude.js';
import { codexSource } from './codex.js';
import { geminiProjectHash, geminiSource, parseGeminiChat, parseGeminiLogs } from './gemini.js';
import { claudeOrigin, codexOrigin } from './origin.js';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const home = async () => { const directory = await mkdtemp(join(tmpdir(), 'village-sources-')); directories.push(directory); return directory; };
const jsonl = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n');
const now = () => new Date().toISOString();

describe('origin mapping', () => {
  it.each([
    ['codex_cli_rs', undefined, 'cli'], [undefined, 'cli', 'cli'], ['codex_vscode', 'vscode', 'ide'], [undefined, 'vscode', 'ide'],
    ['codex_exec', 'exec', 'exec'], [undefined, 'exec', 'exec'], ['Codex Desktop', undefined, 'desktop'], ['codex_desktop', 'vscode', 'desktop'],
    ['A future client', 'mcp', 'unknown'], [undefined, undefined, 'unknown'],
  ] as const)('maps Codex originator %j and source %j to %s', (originator, source, origin) => {
    expect(codexOrigin(originator, source)).toBe(origin);
  });

  it.each([['cli', 'cli'], ['claude-desktop', 'desktop'], ['claude-vscode', 'ide'], ['sdk-ts', 'exec'], ['sdk-cli', 'exec'],
    ['remote', 'cloud'], ['something-new', 'unknown'], [undefined, 'unknown']] as const)('maps Claude entrypoint %j to %s', (entrypoint, origin) => {
    expect(claudeOrigin(entrypoint)).toBe(origin);
  });
});

describe('roots', () => {
  it('honours the tool override, extra environment roots and manifest roots without duplicates', () => {
    const context = { home: '/village-owner', env: { CODEX_HOME: '/opt/codex-home', VILLAGE_CODEX_HOMES: '~/alt/.codex, relative/ignored,/opt/codex-home', CLAUDE_CONFIG_DIR: '' },
      manifestRoots: { codex: ['/srv/desktop-codex'], claude: ['/srv/desktop-claude'] } };
    expect(codexSource.roots(context)).toEqual([
      { path: '/opt/codex-home', from: 'env', variable: 'CODEX_HOME' },
      { path: '/village-owner/alt/.codex', from: 'env', variable: 'VILLAGE_CODEX_HOMES' },
      { path: '/srv/desktop-codex', from: 'manifest' },
    ]);
    expect(claudeSource.roots(context)).toEqual([{ path: '/village-owner/.claude', from: 'default' }, { path: '/srv/desktop-claude', from: 'manifest' }]);
    expect(geminiSource.roots({ ...context, env: { VILLAGE_GEMINI_DIRS: '/srv/gemini' } }).map((root) => root.path)).toEqual(['/village-owner/.gemini', '/srv/gemini']);
  });
});

describe('Codex across roots', () => {
  it('reads an indexed root and a root without index, tags origins and skips helper rollouts', async () => {
    const owner = await home();
    const main = join(owner, '.codex');
    const desktop = join(owner, 'desktop-codex');
    await mkdir(join(main, 'sessions'), { recursive: true });
    await mkdir(join(desktop, 'sessions/2026/11/09'), { recursive: true });
    const indexedJournal = join(main, 'sessions/indexed.jsonl');
    await writeFile(indexedJournal, jsonl([
      { timestamp: now(), type: 'session_meta', payload: { id: 'indexed', originator: 'codex_cli_rs', source: 'cli', cwd: '/w/app' } },
      { timestamp: now(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix the parser' }] } },
    ]));
    execFileSync('sqlite3', [join(main, 'state_5.sqlite'), `CREATE TABLE threads(id,name,title,cwd,rollout_path,updated_at,archived,agent_path);
      INSERT INTO threads VALUES('indexed','Parser','','/w/app','${indexedJournal}',strftime('%s','now'),0,NULL);`]);
    const uuid = '0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
    await writeFile(join(desktop, `sessions/2026/11/09/rollout-2026-11-09T10-00-00-${uuid}.jsonl`), jsonl([
      { timestamp: now(), type: 'session_meta', payload: { id: uuid, originator: 'Codex Desktop', source: 'vscode', cwd: '/w/app' } },
      { timestamp: now(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Review the release notes' }] } },
    ]));
    await writeFile(join(desktop, 'sessions/2026/11/09/rollout-2026-11-09T10-05-00-helper.jsonl'), jsonl([
      { timestamp: now(), type: 'session_meta', payload: { id: 'helper', originator: 'codex_cli_rs', source: { subagent: 'review' }, cwd: '/w/app' } },
      { timestamp: now(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Helper task' }] } },
    ]));
    const result = await new LocalSessions({ home: owner, env: { VILLAGE_CODEX_HOMES: desktop }, gitProbe: async () => undefined }).snapshot();
    const codex = result.sessions.filter((session) => session.tool === 'codex').sort((a, b) => b.id.localeCompare(a.id));
    expect(codex.map((session) => [session.id, session.origin, session.projectKey])).toEqual([
      ['codex:indexed', 'cli', '/w/app'],
      [`codex:${uuid}`, 'desktop', '/w/app'],
    ]);
    expect(codex[1]?.title).toBe('Review the release notes');
    expect(result.coverage).toContain('Codex : index absent, journaux lus directement (sans titres ni sous-agents).');
    expect(result.sources.find((source) => source.id === 'codex')).toMatchObject({ status: 'supported', rootsFound: 2, rootsChecked: 2, sessions: 2 });
    expect(JSON.stringify(result.sessions)).not.toMatch(/originator|Codex Desktop|codex_cli_rs/);
  });

  it('marks a pending approval request only while no later activity follows, never from text', () => {
    const at = (second: number) => `2026-11-09T10:00:0${second}Z`;
    const event = (type: string, second: number) => ({ timestamp: at(second), type: 'event_msg', payload: { type } });
    const pending = parseTranscript(jsonl([event('task_started', 0), event('exec_approval_request', 1), event('token_count', 2)]), 'codex');
    expect(pending.attention).toEqual({ kind: 'approval', at: at(1), source: 'codex-journal' });
    expect(pending.approvalEvents).toBe(1);
    const answered = parseTranscript(jsonl([event('apply_patch_approval_request', 1), event('exec_command_begin', 2)]), 'codex');
    expect(answered.attention).toBeUndefined();
    expect(answered.approvalEvents).toBe(1);
    const textual = parseTranscript(jsonl([{ timestamp: at(1), type: 'response_item', payload: { type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: 'Please approve this command, I need your input.' }] } }]), 'codex');
    expect(textual.attention).toBeUndefined();
  });
});

describe('Claude Code across roots', () => {
  it('reads CLAUDE_CONFIG_DIR and extra roots and tags the client from the journal entrypoint', async () => {
    const owner = await home();
    const config = join(owner, 'claude-config');
    const desktop = join(owner, 'claude-desktop');
    for (const root of [config, desktop]) await mkdir(join(root, 'projects/demo'), { recursive: true });
    const line = (entrypoint: string, text: string) => JSON.stringify({ cwd: '/w/app', entrypoint, userType: 'external', version: '2.0.0', type: 'user', timestamp: now(), message: { role: 'user', content: text } });
    await writeFile(join(config, 'projects/demo/cli-session.jsonl'), line('cli', 'From the terminal'));
    await writeFile(join(desktop, 'projects/demo/app-session.jsonl'), line('claude-desktop', 'From the app'));
    await mkdir(join(owner, '.claude/projects/demo'), { recursive: true });
    await writeFile(join(owner, '.claude/projects/demo/ignored.jsonl'), line('cli', 'Default root replaced by the override'));
    const result = await new LocalSessions({ home: owner, env: { CLAUDE_CONFIG_DIR: config, VILLAGE_CLAUDE_DIRS: desktop }, gitProbe: async () => undefined }).snapshot();
    const claude = result.sessions.filter((session) => session.tool === 'claude');
    expect(Object.fromEntries(claude.map((session) => [session.id, session.origin]))).toEqual({ 'claude:cli-session': 'cli', 'claude:app-session': 'desktop' });
    expect(JSON.stringify(result.sessions)).not.toContain('entrypoint');
  });
});

describe('Gemini CLI (experimental)', () => {
  const chat = (sessionId: string, projectHash: string, prompt: string, extra: object = {}) => JSON.stringify({ sessionId, projectHash, startTime: now(), lastUpdated: now(), messages: [
    { id: '1', timestamp: now(), type: 'user', content: prompt },
    { id: '2', timestamp: now(), type: 'gemini', content: 'Done: added the test.', thoughts: [{ subject: 'PRIVATE THOUGHT' }], toolCalls: [{ name: 'shell', result: 'TOOL OUTPUT' }] },
    { id: '3', timestamp: now(), type: 'info', content: 'Ignored info line' },
  ], ...extra }, null, 2);

  it('parses saved chats and logs tolerantly, keeping only user and model text', () => {
    const parsed = parseGeminiChat(chat('s1', geminiProjectHash('/w/app'), 'Add a test'));
    expect(parsed).toMatchObject({ sessionId: 's1', userMessages: 1, modelMessages: 1, firstRequest: 'Add a test', summary: 'Done: added the test.' });
    expect(JSON.stringify(parsed)).not.toMatch(/PRIVATE THOUGHT|TOOL OUTPUT|Ignored info/);
    expect(parseGeminiChat(JSON.stringify({ messages: [{ type: 'user', timestamp: now(), content: [{ text: 'Parts form' }, { inlineData: {} }] }] }))?.firstRequest).toBe('Parts form');
    expect(parseGeminiChat('{ not json')).toBeUndefined();
    expect(parseGeminiChat('[]')).toBeUndefined();
    expect(parseGeminiLogs(JSON.stringify([{ sessionId: 'old', messageId: 0, type: 'user', message: 'First prompt', timestamp: now() },
      { sessionId: 'old', messageId: 1, type: 'user', message: 'Second', timestamp: now() }]))).toEqual([
      expect.objectContaining({ sessionId: 'old', userMessages: 2, firstRequest: 'First prompt', objective: 'Second' })]);
    expect(parseGeminiLogs('nope')).toEqual([]);
  });

  it('resolves working-directory hashes against folders seen in other sources and the manifest', async () => {
    const owner = await home();
    const gemini = join(owner, '.gemini/tmp');
    const knownHash = geminiProjectHash('/w/app');
    const manifestHash = geminiProjectHash('/w/notes');
    const ancestorHash = geminiProjectHash('/w');
    const unknownHash = geminiProjectHash('/somewhere/else');
    for (const [hash, id, prompt] of [[knownHash, 'g-known', 'Known folder'], [manifestHash, 'g-manifest', 'Manifest folder'],
      [ancestorHash, 'g-ancestor', 'Parent folder'], [unknownHash, 'g-unknown', 'Unknown folder']]) {
      await mkdir(join(gemini, hash!, 'chats'), { recursive: true });
      await writeFile(join(gemini, hash!, 'chats', `session-${id}.json`), chat(id!, hash!, prompt!));
    }
    await writeFile(join(gemini, unknownHash, 'chats', 'broken.json'), '{ "sessionId": ');
    await mkdir(join(gemini, knownHash), { recursive: true });
    await writeFile(join(gemini, knownHash, 'logs.json'), JSON.stringify([{ sessionId: 'g-known', type: 'user', message: 'dup', timestamp: now() },
      { sessionId: 'g-logs-only', type: 'user', message: 'Only in logs', timestamp: now() }]));
    const old = join(gemini, knownHash, 'chats', 'session-old.json');
    await writeFile(old, chat('g-old', knownHash, 'Too old'));
    await utimes(old, new Date('2020-01-01'), new Date('2020-01-01'));
    await mkdir(join(owner, '.claude/projects/demo'), { recursive: true });
    await writeFile(join(owner, '.claude/projects/demo/c1.jsonl'), JSON.stringify({ cwd: '/w/app', type: 'user', timestamp: now(), message: { role: 'user', content: 'Claude in app' } }));
    const privateDir = join(owner, 'private');
    await mkdir(privateDir, { mode: 0o700 });
    await writeFile(join(privateDir, 'projects.yaml'), 'projects:\n  - name: Notes\n    paths: [/w/notes]\n', { mode: 0o600 });

    const result = await new LocalSessions({ home: owner, manifestPath: join(privateDir, 'projects.yaml'), gitProbe: async () => undefined }).snapshot();
    const byId = (id: string) => result.sessions.find((session) => session.id === id);
    expect(byId('claude:c1')).toMatchObject({ projectKey: '/w/app' });
    expect(byId('gemini:g-known')).toMatchObject({ tool: 'gemini', origin: 'cli', projectKey: '/w/app', matchedBy: 'folder', summary: 'Done: added the test.',
      activityEvidence: { level: 'recent', source: 'gemini-chat' } });
    expect(byId('gemini:g-manifest')).toMatchObject({ projectKey: 'alias:Notes', matchedBy: 'rule', matchVia: 'path' });
    expect(byId('gemini:g-ancestor')).toMatchObject({ projectKey: '/w', matchedBy: 'folder' });
    expect(byId('gemini:g-unknown')).toMatchObject({ projectKey: 'unassigned', matchedBy: 'unassigned', matchVia: 'unknown-hash', matchDetail: `${unknownHash.slice(0, 12)}…` });
    expect(byId('gemini:g-logs-only')).toMatchObject({ projectKey: '/w/app', objective: 'Only in logs' });
    expect(byId('gemini:g-old')).toBeUndefined();
    expect(result.sessions.filter((session) => session.id === 'gemini:g-known')).toHaveLength(1);
    expect(result.errors).toContain('Gemini : certains historiques sont illisibles');
    expect(result.coverage).toContain('Gemini : dossier de certaines sessions non retrouvé ; ajoutez-le à paths dans projects.yaml.');
    expect(result.sources.find((source) => source.id === 'gemini')).toMatchObject({ status: 'experimental', experimental: true, sessions: 5 });
  });
});

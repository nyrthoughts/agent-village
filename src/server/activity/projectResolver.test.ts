import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalPath, defaultCatchAll, displayPath, gitProbe, normalizeRemote, ProjectResolver, remoteKey, resolveProject,
  ruleKey, rulesFromAliases, UNASSIGNED_KEY, type GitFacts, type ProjectRule, type ResolverConfig,
} from './projectResolver.js';

const HOME = '/village-owner';
const rule = (name: string, fields: Partial<Omit<ProjectRule, 'name'>> = {}): ProjectRule =>
  ({ name, sessions: [], remotes: [], paths: [], titles: [], ...fields });
const config = (rules: ProjectRule[] = []): ResolverConfig => ({ home: HOME, rules, catchAll: defaultCatchAll(HOME) });
const WAREHOUSE = 'github.com/demo-org/warehouse';

describe('normalizeRemote', () => {
  it.each([
    'git@github.com:demo-org/warehouse.git',
    'git@github.com:demo-org/warehouse',
    'github.com:demo-org/warehouse.git',
    'https://github.com/demo-org/warehouse',
    'https://github.com/demo-org/warehouse.git',
    'https://github.com/Demo-Org/Warehouse.git/',
    'http://github.com/demo-org/warehouse',
    'ssh://git@github.com/demo-org/warehouse.git',
    'ssh://git@github.com:22/demo-org/warehouse.git',
    'git+ssh://git@github.com/demo-org/warehouse',
    'git://github.com/demo-org/warehouse.git',
    '  https://github.com/demo-org/warehouse\n',
  ])('maps %s to host/owner/repo', (url) => expect(normalizeRemote(url)).toBe(WAREHOUSE));

  it('drops embedded credentials', () => {
    const normalized = normalizeRemote('https://demo-user:fake-token-value@github.com/demo-org/warehouse.git');
    expect(normalized).toBe(WAREHOUSE);
    expect(normalized).not.toContain('fake-token-value');
  });

  it('keeps nested groups', () => expect(normalizeRemote('git@gitlab.example:team/sub/tool.git')).toBe('gitlab.example/team/sub/tool'));

  it.each(['', '   ', '/srv/git/warehouse.git', './warehouse', '../warehouse.git', 'file:///srv/git/warehouse.git',
    'https://github.com', 'git@host:a/../b', 'not a url', 'javascript:alert(1)',
    // A malformed percent escape must not throw (it would drop the session or break manifest validation).
    'https://example.com/org/%', 'https://example.com/org/%zz.git'])('rejects %j', (url) => {
    expect(normalizeRemote(url)).toBeUndefined();
  });
});

describe('path helpers', () => {
  it('shows paths relative to home without exposing the absolute home directory', () => {
    expect(displayPath(HOME, HOME)).toBe('~');
    expect(displayPath(`${HOME}/code/app`, HOME)).toBe('~/code/app');
    expect(displayPath(`${HOME}-other/app`, HOME)).toBe(`${HOME}-other/app`);
  });

  it('maps a worktree subfolder to the same subfolder in the main checkout', () => {
    expect(canonicalPath('/w/repo/.claude/worktrees/feat/pkg/a', undefined)).toBe('/w/repo/pkg/a');
    expect(canonicalPath('/w/repo/.claude/worktrees/feat', undefined)).toBe('/w/repo');
    expect(canonicalPath('/x/wt/pkg', { root: '/w/repo', toplevel: '/x/wt' })).toBe('/w/repo/pkg');
    expect(canonicalPath('/w/repo/pkg', { root: '/w/repo', toplevel: '/w/repo' })).toBe('/w/repo/pkg');
  });
});

describe('resolveProject branches', () => {
  it('a. matches an explicit session id before anything else, even in a catch-all directory', () => {
    const result = resolveProject({ id: 'codex:abc123', cwd: HOME }, undefined, config([rule('Warehouse', { sessions: ['codex:abc123'] })]));
    expect(result).toMatchObject({ key: ruleKey('Warehouse'), name: 'Warehouse', matchedBy: 'rule', matchVia: 'session', detail: 'codex:abc123' });
  });

  it('a. matches a remote rule', () => {
    const result = resolveProject({ id: 'codex:1', cwd: '/w/clone' }, { root: '/w/clone', remote: WAREHOUSE }, config([rule('Stock', { remotes: [WAREHOUSE] })]));
    expect(result).toMatchObject({ key: ruleKey('Stock'), matchedBy: 'rule', matchVia: 'remote', detail: WAREHOUSE, legacyKey: '/w/clone' });
  });

  it('a. matches a title regex for sessions started from the home directory', () => {
    const rules = [rule('Warehouse', { titles: [/^warehouse:/i] })];
    expect(resolveProject({ id: 'claude:1', cwd: HOME, titles: ['', 'Warehouse: fix the stock count'] }, undefined, config(rules)))
      .toMatchObject({ key: ruleKey('Warehouse'), matchedBy: 'rule', matchVia: 'title', detail: '^warehouse:' });
    expect(resolveProject({ id: 'claude:2', cwd: HOME, titles: ['Groceries'] }, undefined, config(rules)).matchedBy).toBe('unassigned');
  });

  it('a. lets a monorepo subfolder become its own project while the rest stays with the repository', () => {
    const rules = [rule('Monorepo', { remotes: ['github.com/demo-org/monorepo'] }), rule('Warehouse', { paths: ['/w/mono/packages/warehouse'] })];
    const git: GitFacts = { root: '/w/mono', toplevel: '/w/mono', remote: 'github.com/demo-org/monorepo' };
    expect(resolveProject({ id: 'codex:1', cwd: '/w/mono/packages/warehouse/src' }, git, config(rules)))
      .toMatchObject({ name: 'Warehouse', matchVia: 'path', detail: '/w/mono/packages/warehouse' });
    expect(resolveProject({ id: 'codex:2', cwd: '/w/mono/packages/billing' }, git, config(rules)))
      .toMatchObject({ name: 'Monorepo', matchVia: 'remote' });
    // The same subfolder inside a worktree of the monorepo belongs to the subfolder project too.
    expect(resolveProject({ id: 'claude:3', cwd: '/w/mono/.claude/worktrees/feat/packages/warehouse' },
      { root: '/w/mono', toplevel: '/w/mono/.claude/worktrees/feat', remote: 'github.com/demo-org/monorepo' }, config(rules)).name).toBe('Warehouse');
  });

  it('a. prefers the longest matching path prefix', () => {
    const rules = [rule('Outer', { paths: ['/w/mono'] }), rule('Inner', { paths: ['/w/mono/packages/a'] })];
    expect(resolveProject({ id: 'x:1', cwd: '/w/mono/packages/a/lib' }, undefined, config(rules)).name).toBe('Inner');
    expect(resolveProject({ id: 'x:2', cwd: '/w/mono/packages/b' }, undefined, config(rules)).name).toBe('Outer');
    expect(resolveProject({ id: 'x:3', cwd: '/w/monolith' }, undefined, config(rules)).matchedBy).toBe('folder');
  });

  it('a. treats a rule on a catch-all directory as that directory only', () => {
    const rules = [rule('Personal', { paths: [HOME] })];
    expect(resolveProject({ id: 'x:1', cwd: HOME }, undefined, config(rules)).name).toBe('Personal');
    expect(resolveProject({ id: 'x:2', cwd: `${HOME}/code/app` }, undefined, config(rules)).matchedBy).toBe('folder');
  });

  it('b. merges separate clones of one repository through the normalised origin remote', () => {
    const ssh = resolveProject({ id: 'codex:1', cwd: '/w/warehouse' }, { root: '/w/warehouse', remote: normalizeRemote('git@github.com:demo-org/warehouse.git') }, config());
    const https = resolveProject({ id: 'claude:2', cwd: '/x/copy-of-warehouse' }, { root: '/x/copy-of-warehouse', remote: normalizeRemote('https://github.com/demo-org/warehouse') }, config());
    expect(ssh.key).toBe(remoteKey(WAREHOUSE));
    expect(https.key).toBe(ssh.key);
    expect(ssh).toMatchObject({ name: 'warehouse', matchedBy: 'remote', matchVia: 'remote', detail: WAREHOUSE, legacyKey: '/w/warehouse' });
    expect(https.legacyKey).toBe('/x/copy-of-warehouse');
  });

  it('b. uses the repository recorded by the source when the folder no longer exists', () => {
    expect(resolveProject({ id: 'codex:1', cwd: '/w/deleted', recordedRemote: WAREHOUSE }, undefined, config()))
      .toMatchObject({ key: remoteKey(WAREHOUSE), matchedBy: 'remote', matchVia: 'recorded', legacyKey: '/w/deleted' });
    expect(resolveProject({ id: 'codex:2', recordedRemote: WAREHOUSE }, undefined, config()).key).toBe(remoteKey(WAREHOUSE));
  });

  it('c. maps a Git worktree and a Claude worktree to the main repository without a remote', () => {
    const git = { root: '/w/app', toplevel: '/w/app-feature' };
    expect(resolveProject({ id: 'codex:1', cwd: '/w/app-feature' }, git, config()))
      .toMatchObject({ key: '/w/app', name: 'app', matchedBy: 'git-root', detail: '/w/app' });
    expect(resolveProject({ id: 'claude:1', cwd: '/w/app/.claude/worktrees/fix' }, undefined, config()))
      .toMatchObject({ key: '/w/app', matchedBy: 'git-root', matchVia: 'claude-worktree' });
    expect(resolveProject({ id: 'codex:2', cwd: '/w/app' }, { root: '/w/app', toplevel: '/w/app' }, config()).legacyKey).toBeUndefined();
  });

  it('d. falls back to the working directory', () => {
    expect(resolveProject({ id: 'codex:1', cwd: `${HOME}/notes/` }, undefined, config()))
      .toMatchObject({ key: `${HOME}/notes`, name: 'notes', matchedBy: 'folder', detail: '~/notes' });
  });

  it('e. sends catch-all directories and sessions without a folder to Unassigned', () => {
    const unassigned = { key: UNASSIGNED_KEY, matchedBy: 'unassigned' };
    expect(resolveProject({ id: 'codex:1', cwd: HOME }, undefined, config())).toMatchObject({ ...unassigned, matchVia: 'catch-all', detail: '~' });
    expect(resolveProject({ id: 'codex:2', cwd: '/tmp' }, undefined, config())).toMatchObject(unassigned);
    expect(resolveProject({ id: 'codex:3', cwd: '/tmp/scratch' }, undefined, config())).toMatchObject(unassigned);
    expect(resolveProject({ id: 'codex:4' }, undefined, config())).toMatchObject({ ...unassigned, matchVia: 'no-cwd' });
    // The home directory is not a project even when it is a dotfiles repository.
    expect(resolveProject({ id: 'codex:5', cwd: HOME }, { root: HOME, toplevel: HOME, remote: 'github.com/demo/dotfiles' }, config())).toMatchObject(unassigned);
    // A real repository below /tmp keeps its identity.
    expect(resolveProject({ id: 'codex:6', cwd: '/tmp/checkout' }, { root: '/tmp/checkout', toplevel: '/tmp/checkout' }, config()).matchedBy).toBe('git-root');
    expect(resolveProject({ id: 'codex:7', cwd: '/tmp/checkout' }, undefined, { ...config(), catchAll: [] }).matchedBy).toBe('folder');
  });

  it('applies the documented priority: rule > remote > git root > folder', () => {
    const git = { root: '/w/app', toplevel: '/w/app', remote: WAREHOUSE };
    const session = { id: 'codex:1', cwd: '/w/app/src' };
    expect(resolveProject(session, git, config([rule('Owner choice', { paths: ['/w/app'] })])).matchedBy).toBe('rule');
    expect(resolveProject(session, git, config()).matchedBy).toBe('remote');
    expect(resolveProject(session, { ...git, remote: undefined }, config()).matchedBy).toBe('git-root');
    expect(resolveProject(session, undefined, config()).matchedBy).toBe('folder');
    // Within rules, a session id beats a path, which beats a remote, which beats a title.
    const rules = [rule('ByTitle', { titles: [/app/] }), rule('ByRemote', { remotes: [WAREHOUSE] }), rule('ByPath', { paths: ['/w/app'] }), rule('BySession', { sessions: ['codex:1'] })];
    const titled = { ...session, titles: ['app work'] };
    expect(resolveProject(titled, git, config(rules)).name).toBe('BySession');
    expect(resolveProject({ ...titled, id: 'codex:2' }, git, config(rules)).name).toBe('ByPath');
    expect(resolveProject({ ...titled, id: 'codex:2', cwd: '/x/clone' }, { ...git, root: '/x/clone', toplevel: '/x/clone' }, config(rules)).name).toBe('ByRemote');
    expect(resolveProject({ ...titled, id: 'codex:2', cwd: HOME }, undefined, config(rules)).name).toBe('ByTitle');
  });
});

describe('alias migration', () => {
  it('turns VILLAGE_PROJECT_ALIASES into rules with the same project keys', () => {
    const rules = rulesFromAliases({ 'session:codex:p1': 'Alpha', 'title:Alpha ': 'Alpha', '/w/alpha': 'Alpha', '~/beta': 'Beta', 'bogus': 'Ignored' }, HOME);
    expect(rules.map((entry) => entry.name)).toEqual(['Alpha', 'Beta']);
    expect(rules[0]).toMatchObject({ sessions: ['codex:p1'], paths: ['/w/alpha'] });
    expect(rules[1]?.paths).toEqual([`${HOME}/beta`]);
    const all = config(rules);
    expect(resolveProject({ id: 'codex:p1', cwd: '/elsewhere' }, undefined, all).key).toBe('alias:Alpha');
    expect(resolveProject({ id: 'claude:x', cwd: HOME, titles: ['Alpha follow-up'] }, undefined, all).key).toBe('alias:Alpha');
    expect(resolveProject({ id: 'claude:y', cwd: HOME, titles: ['Not Alpha follow-up'] }, undefined, all).key).toBe(UNASSIGNED_KEY);
    expect(resolveProject({ id: 'claude:z', cwd: '/w/alpha/.claude/worktrees/x' }, undefined, all).key).toBe('alias:Alpha');
    // A prefix with regular-expression characters is matched literally.
    expect(rulesFromAliases({ 'title:a.b (c)': 'Lit' }, HOME)[0]?.titles[0]?.test('a.b (c) next')).toBe(true);
    expect(rulesFromAliases({ 'title:a.b (c)': 'Lit' }, HOME)[0]?.titles[0]?.test('axb (c)')).toBe(false);
  });
});

describe('ProjectResolver', () => {
  it('probes each directory once and skips Git for session rules and catch-all directories', async () => {
    const probe = vi.fn(async (directory: string) => directory === '/w/app' ? { root: '/w/app', toplevel: '/w/app', remote: WAREHOUSE } : undefined);
    const resolver = new ProjectResolver(probe);
    const rules = config([rule('Pinned', { sessions: ['codex:pinned'] })]);
    expect((await resolver.resolve({ id: 'codex:1', cwd: '/w/app' }, rules)).key).toBe(remoteKey(WAREHOUSE));
    expect((await resolver.resolve({ id: 'codex:2', cwd: '/w/app' }, rules)).key).toBe(remoteKey(WAREHOUSE));
    expect((await resolver.resolve({ id: 'codex:pinned', cwd: '/w/other' }, rules)).name).toBe('Pinned');
    expect((await resolver.resolve({ id: 'codex:3', cwd: HOME }, rules)).key).toBe(UNASSIGNED_KEY);
    expect(probe.mock.calls.map(([directory]) => directory)).toEqual(['/w/app']);
  });

  it('falls back to the main checkout when a Claude worktree folder was removed', async () => {
    const probe = vi.fn(async (directory: string) => directory === '/w/app' ? { root: '/w/app', toplevel: '/w/app', remote: WAREHOUSE } : undefined);
    const result = await new ProjectResolver(probe).resolve({ id: 'claude:1', cwd: '/w/app/.claude/worktrees/gone' }, config());
    expect(result).toMatchObject({ key: remoteKey(WAREHOUSE), matchedBy: 'remote' });
    expect(probe.mock.calls.map(([directory]) => directory)).toEqual(['/w/app/.claude/worktrees/gone', '/w/app']);
  });

  it('expires cached Git facts and survives a failing probe', async () => {
    let now = 0;
    const probe = vi.fn(async () => { throw new Error('git missing'); });
    const resolver = new ProjectResolver(probe, 1000, () => now);
    expect((await resolver.resolve({ id: 'codex:1', cwd: '/w/app' }, config())).matchedBy).toBe('folder');
    await resolver.resolve({ id: 'codex:1', cwd: '/w/app' }, config());
    now = 2000;
    await resolver.resolve({ id: 'codex:1', cwd: '/w/app' }, config());
    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe('gitProbe against real repositories', () => {
  const directories: string[] = [];
  afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });

  it('merges a worktree and a second clone of the same remote, and keeps a remote-less repository by its root', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'village-git-'))); directories.push(base);
    const main = join(base, 'warehouse');
    const clone = join(base, 'elsewhere', 'warehouse-copy');
    const local = join(base, 'scratch-repo');
    for (const directory of [main, clone, local]) { await mkdir(directory, { recursive: true }); git(directory, 'init', '-q'); }
    git(main, 'remote', 'add', 'origin', 'git@github.com:demo-org/warehouse.git');
    git(clone, 'remote', 'add', 'origin', 'https://github.com/demo-org/warehouse');
    git(main, '-c', 'user.name=Demo', '-c', 'user.email=demo@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'init');
    git(main, 'worktree', 'add', '-q', join(main, '.claude', 'worktrees', 'feat'));
    await mkdir(join(main, 'packages', 'stock'), { recursive: true });

    expect(await gitProbe(join(main, '.claude', 'worktrees', 'feat'))).toEqual({ root: main, toplevel: join(main, '.claude', 'worktrees', 'feat'), remote: WAREHOUSE });
    expect(await gitProbe(join(main, 'packages', 'stock'))).toMatchObject({ root: main, toplevel: main });
    expect(await gitProbe(local)).toEqual({ root: local, toplevel: local, remote: undefined });
    expect(await gitProbe(join(base, 'missing'))).toBeUndefined();

    const resolver = new ProjectResolver(gitProbe);
    const all = { ...config(), home: base, catchAll: [] };
    const keys = await Promise.all([main, clone, join(main, '.claude', 'worktrees', 'feat')].map((cwd, index) => resolver.resolve({ id: `codex:${index}`, cwd }, all)));
    expect(new Set(keys.map((entry) => entry.key))).toEqual(new Set([remoteKey(WAREHOUSE)]));
    expect((await resolver.resolve({ id: 'codex:local', cwd: local }, all))).toMatchObject({ key: local, matchedBy: 'git-root', detail: '~/scratch-repo' });
  });
});

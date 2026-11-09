import { execFile } from 'node:child_process';
import { posix } from 'node:path';
import { promisify } from 'node:util';
import type { MatchedBy, MatchVia, OwnerLink } from '../../shared/observation.js';

/**
 * Project resolution: which project a session belongs to, and why.
 *
 * The pure part (`resolveProject` and helpers) never touches the file system or
 * spawns processes; Git facts arrive through an injected probe. First match wins:
 *   1. owner rule (session id > path prefix, longest first > git remote > title regex)
 *   2. normalised `origin` remote (live probe, else the URL recorded by the source)
 *   3. Git common directory (worktrees map to their main repository)
 *   4. working directory
 *   5. Unassigned: catch-all directories (home, /tmp, ...) and sessions without a folder
 * A catch-all directory itself is never a project, even when it is a Git repository
 * (a dotfiles repository in the home directory, for example).
 */

export const UNASSIGNED_KEY = 'unassigned';
export const UNASSIGNED_NAME = 'Sessions non classées';
/** Rule keys keep the prefix of the earlier alias mechanism so saved plans stay attached. */
export const ruleKey = (name: string) => `alias:${name}`;
export const remoteKey = (remote: string) => `remote:${remote}`;

export interface ProjectRule {
  name: string;
  sessions: string[];
  /** Normalised remotes (see `normalizeRemote`). */
  remotes: string[];
  /** Absolute, normalised path prefixes. */
  paths: string[];
  titles: RegExp[];
}
export interface ResolverConfig {
  home: string;
  rules: ProjectRule[];
  /** Absolute directories; an entry ending in `/**` also covers everything below it. */
  catchAll: string[];
}
export interface SessionFacts {
  /** Source-qualified id, such as `codex:abc123` or `claude:<uuid>`. */
  id: string;
  cwd?: string;
  /** Title, first prompt or process name: anything a title rule may match. */
  titles?: string[];
  /** Normalised repository URL recorded by the source itself (Codex session metadata). */
  recordedRemote?: string;
}
export interface GitFacts {
  /** Main working tree of the repository (or the bare repository), from the common Git directory. */
  root?: string;
  /** Top of the working tree that contains the cwd (differs from root inside a worktree). */
  toplevel?: string;
  /** Normalised `origin` remote. */
  remote?: string;
}
export type GitProbe = (directory: string) => Promise<GitFacts | undefined>;
export interface ProjectResolution {
  key: string;
  name: string;
  matchedBy: MatchedBy;
  matchVia?: MatchVia;
  /** Human-readable evidence for the match. Paths are shown relative to `~`. */
  detail: string;
  /** Key the pre-resolver grouping would have produced, when different. Used to keep saved plans. */
  legacyKey?: string;
}
export interface DeclaredProject { key: string; name: string; links: OwnerLink[] }

const WORKTREE_MARKER = '/.claude/worktrees/';

/** Maps SSH, scp-like and HTTPS forms of a remote to `host/owner/repo`. Credentials and ports are dropped. */
export function normalizeRemote(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw || raw.length > 2048 || /\s/.test(raw)) return undefined;
  let host: string;
  let path: string;
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/\/)(.+)$/.exec(raw);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url: URL;
    try { url = new URL(raw); } catch { return undefined; }
    if (!['ssh:', 'git+ssh:', 'ssh+git:', 'https:', 'http:', 'git:'].includes(url.protocol)) return undefined;
    host = url.hostname;
    // A malformed escape (`/org/%`) must reject this remote, not the whole session or manifest.
    try { path = decodeURIComponent(url.pathname); } catch { return undefined; }
  } else if (scp && !raw.startsWith('/') && !raw.startsWith('.')) {
    host = scp[1]!;
    path = scp[2]!;
  } else return undefined; // Local paths and file:// remotes are not a shared identity.
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  host = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!/^[a-z0-9.-]+$/.test(host) || !/^[\w.~/-]+$/.test(path) || path.split('/').some((part) => !part || part === '..' || part === '.')) return undefined;
  return `${host}/${path}`.toLowerCase();
}

export function expandHome(value: string, home: string): string {
  const trimmed = value.trim();
  const expanded = trimmed === '~' ? home : trimmed.startsWith('~/') ? posix.join(home, trimmed.slice(2)) : trimmed;
  const normalized = posix.normalize(expanded);
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

export function isWithin(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix === '/' ? '/' : `${prefix}/`);
}

/** Display form that never shows the owner's absolute home path. */
export function displayPath(path: string, home: string): string {
  if (path === home) return '~';
  return isWithin(path, home) ? `~/${path.slice(home.length + 1)}` : path;
}

/** The main checkout a Claude worktree belongs to, from its path alone. */
export function claudeWorktreeParent(cwd: string): string | undefined {
  const index = cwd.indexOf(WORKTREE_MARKER);
  return index > 0 ? cwd.slice(0, index) : undefined;
}

/** Equivalent path in the main checkout: `<root>/.claude/worktrees/x/pkg` becomes `<root>/pkg`. */
export function canonicalPath(cwd: string, git: GitFacts | undefined): string {
  if (git?.root && git.toplevel && isWithin(cwd, git.toplevel)) return posix.join(git.root, cwd.slice(git.toplevel.length));
  const parent = claudeWorktreeParent(cwd);
  if (!parent) return cwd;
  const rest = cwd.slice(parent.length + WORKTREE_MARKER.length).split('/').slice(1).join('/');
  return rest ? posix.join(parent, rest) : parent;
}

function catchAllMatch(cwd: string, catchAll: string[], exactOnly: boolean): string | undefined {
  return catchAll.find((entry) => {
    if (entry.endsWith('/**')) {
      const base = entry.slice(0, -3) || '/';
      return exactOnly ? cwd === base : isWithin(cwd, base);
    }
    return cwd === entry;
  });
}

function catchAllRoots(catchAll: string[]): string[] {
  return catchAll.map((entry) => entry.endsWith('/**') ? entry.slice(0, -3) || '/' : entry);
}

interface RuleHit { rule: ProjectRule; via: MatchVia; detail: string }

/** Rule fields are tried by specificity across all rules: session, then path (longest prefix), remote, title. */
export function matchRule(session: SessionFacts, git: GitFacts | undefined, config: ResolverConfig): RuleHit | undefined {
  const { rules, home } = config;
  for (const rule of rules) if (rule.sessions.includes(session.id)) return { rule, via: 'session', detail: session.id };
  if (session.cwd) {
    const candidates = [...new Set([session.cwd, canonicalPath(session.cwd, git)])];
    const roots = catchAllRoots(config.catchAll);
    let best: RuleHit | undefined;
    let bestLength = -1;
    for (const rule of rules) {
      for (const prefix of rule.paths) {
        // A catch-all directory as a rule path means that directory only, never everything below it.
        const hit = roots.includes(prefix) ? candidates.includes(prefix) : candidates.some((path) => isWithin(path, prefix));
        if (hit && prefix.length > bestLength) { best = { rule, via: 'path', detail: displayPath(prefix, home) }; bestLength = prefix.length; }
      }
    }
    if (best) return best;
  }
  const remote = git?.remote ?? session.recordedRemote;
  if (remote) for (const rule of rules) if (rule.remotes.includes(remote)) return { rule, via: 'remote', detail: remote };
  for (const rule of rules) {
    for (const pattern of rule.titles) {
      if ((session.titles ?? []).some((title) => title && pattern.test(title))) return { rule, via: 'title', detail: pattern.source };
    }
  }
  return undefined;
}

/** Grouping before project resolution existed: Git root, Claude worktree parent, then folder. */
export function legacyKey(cwd: string, git: GitFacts | undefined): string {
  return git?.root ?? claudeWorktreeParent(cwd) ?? cwd;
}

function repositoryName(path: string): string {
  return posix.basename(path).replace(/\.git$/i, '') || path;
}

export function resolveProject(session: SessionFacts, git: GitFacts | undefined, config: ResolverConfig): ProjectResolution {
  const { home } = config;
  const cwd = session.cwd ? expandHome(session.cwd, home) : undefined;
  const facts = { ...session, cwd };
  const legacy = cwd ? legacyKey(cwd, git) : undefined;
  const withLegacy = (resolution: ProjectResolution): ProjectResolution =>
    legacy && legacy !== resolution.key ? { ...resolution, legacyKey: legacy } : resolution;

  const hit = matchRule(facts, git, config);
  if (hit) return withLegacy({ key: ruleKey(hit.rule.name), name: hit.rule.name, matchedBy: 'rule', matchVia: hit.via, detail: hit.detail });

  const exactCatchAll = cwd ? catchAllMatch(cwd, config.catchAll, true) : undefined;
  if (exactCatchAll) return { key: UNASSIGNED_KEY, name: UNASSIGNED_NAME, matchedBy: 'unassigned', matchVia: 'catch-all', detail: displayPath(cwd!, home) };

  if (git?.remote) return withLegacy({ key: remoteKey(git.remote), name: repositoryName(git.remote), matchedBy: 'remote', matchVia: 'remote', detail: git.remote });
  // The source's own record still works when the folder was deleted or moved.
  if (session.recordedRemote) {
    return withLegacy({ key: remoteKey(session.recordedRemote), name: repositoryName(session.recordedRemote), matchedBy: 'remote', matchVia: 'recorded', detail: session.recordedRemote });
  }
  if (!cwd) return { key: UNASSIGNED_KEY, name: UNASSIGNED_NAME, matchedBy: 'unassigned', matchVia: 'no-cwd', detail: '' };

  if (git?.root) return { key: git.root, name: repositoryName(git.root), matchedBy: 'git-root', detail: displayPath(git.root, home) };
  const parent = claudeWorktreeParent(cwd);
  if (parent) return { key: parent, name: repositoryName(parent), matchedBy: 'git-root', matchVia: 'claude-worktree', detail: displayPath(parent, home) };

  if (catchAllMatch(cwd, config.catchAll, false)) return { key: UNASSIGNED_KEY, name: UNASSIGNED_NAME, matchedBy: 'unassigned', matchVia: 'catch-all', detail: displayPath(cwd, home) };
  return { key: cwd, name: repositoryName(cwd), matchedBy: 'folder', detail: displayPath(cwd, home) };
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Migrates `VILLAGE_PROJECT_ALIASES` into rules. `session:ID` becomes a session rule,
 * `title:PREFIX` an anchored title rule and any other key a path rule (now a prefix).
 */
export function rulesFromAliases(aliases: Record<string, string>, home: string): ProjectRule[] {
  const byName = new Map<string, ProjectRule>();
  for (const [key, name] of Object.entries(aliases)) {
    if (typeof name !== 'string' || !name.trim()) continue;
    const rule = byName.get(name) ?? { name, sessions: [], remotes: [], paths: [], titles: [] };
    if (key.startsWith('session:')) rule.sessions.push(key.slice('session:'.length));
    else if (key.startsWith('title:')) rule.titles.push(new RegExp(`^${escapeRegExp(key.slice('title:'.length))}`));
    else if (key.startsWith('/') || key.startsWith('~')) rule.paths.push(expandHome(key, home));
    else continue;
    byName.set(name, rule);
  }
  return [...byName.values()];
}

export function defaultCatchAll(home: string): string[] {
  return [home, '/tmp', '/tmp/**', '/private/tmp', '/private/tmp/**'];
}

/** Probes Git once per directory and caches the facts for a bounded time. */
export class ProjectResolver {
  private readonly cache = new Map<string, { at: number; facts: Promise<GitFacts | undefined> }>();
  constructor(private readonly probe: GitProbe, private readonly ttlMs = 5 * 60_000, private readonly now: () => number = Date.now) {}

  private facts(directory: string): Promise<GitFacts | undefined> {
    const cached = this.cache.get(directory);
    if (cached && this.now() - cached.at < this.ttlMs) return cached.facts;
    const facts = this.probe(directory).catch(() => undefined);
    this.cache.set(directory, { at: this.now(), facts });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return facts;
  }

  async resolve(session: SessionFacts, config: ResolverConfig): Promise<ProjectResolution> {
    const cwd = session.cwd ? expandHome(session.cwd, config.home) : undefined;
    if (!cwd) return resolveProject(session, undefined, config);
    // Git is probed before rule matching: a `remotes:` rule can claim a catch-all directory that is
    // itself that repository, and the legacy key of a rule match is the Git root, not the raw cwd.
    // Only a catch-all directory with no remote rule to try can skip the probe.
    if (catchAllMatch(cwd, config.catchAll, true) && !config.rules.some((rule) => rule.remotes.length > 0)) {
      return resolveProject(session, undefined, config);
    }
    let git = await this.facts(cwd);
    const parent = claudeWorktreeParent(cwd);
    // A removed Claude worktree still belongs to its main checkout.
    if (!git && parent) git = await this.facts(parent);
    return resolveProject(session, git, config);
  }
}

const execute = promisify(execFile);

/** Read-only Git queries with short timeouts. The raw remote URL is normalised and never retained. */
export const gitProbe: GitProbe = async (directory) => {
  const options = { timeout: 1500, maxBuffer: 8192 };
  let root: string | undefined;
  let toplevel: string | undefined;
  try {
    const { stdout } = await execute('git', ['-C', directory, 'rev-parse', '--path-format=absolute', '--git-common-dir'], options);
    const common = stdout.trim();
    root = common.endsWith('/.git') ? posix.dirname(common) : common || undefined;
  } catch { return undefined; }
  try { toplevel = (await execute('git', ['-C', directory, 'rev-parse', '--show-toplevel'], options)).stdout.trim() || undefined; }
  catch { /* Bare repositories have no working tree. */ }
  let remote: string | undefined;
  try { remote = normalizeRemote((await execute('git', ['-C', directory, 'remote', 'get-url', 'origin'], options)).stdout); }
  catch { /* No origin remote. */ }
  return { root, toplevel, remote };
};

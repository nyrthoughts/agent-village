import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { SourceId } from '../../../shared/observation.js';
import { ProjectManifestFile } from '../../config/projectManifest.js';
import { CLAUDE_HOOK_EVENTS } from '../hookStore.js';
import { clientValue, parseTranscript } from '../projectObserver.js';
import { displayPath } from '../projectResolver.js';
import { CLAUDE_JOURNAL, claudeSource } from './claude.js';
import { codexSource } from './codex.js';
import { GEMINI_HASH, geminiFiles, geminiProjectHash, geminiSource, readGeminiFile } from './gemini.js';
import { findFiles, readHeadLine, readTail } from './journal.js';
import { claudeOrigin, codexOrigin } from './origin.js';
import { WEEK_MS, type SessionSource, type SourceRoot } from './types.js';

/**
 * `npm run sources:doctor`: what each local source reader would find on this computer.
 * Read-only and offline. Prints only paths relative to `~`, counts and short client identifiers
 * (Codex originator/source, Claude entrypoint); never titles, prompts or replies.
 */
export interface DoctorOptions {
  home: string;
  env: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
  /** Owner manifest, for extra roots and known project folders. */
  manifestPath?: string;
  now?: number;
}

const execute = promisify(execFile);
const ORIGIN_SAMPLE = 500;
const APPROVAL_SAMPLE = 60;
const MARKER = 'agent-village-hook';

type Counter = Map<string, number>;
const bump = (counter: Counter, key: string) => counter.set(key, (counter.get(key) ?? 0) + 1);
const list = (counter: Counter) => counter.size ? [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => `${key} ×${count}`).join(', ') : 'none';

async function exists(path: string): Promise<'directory' | 'file' | undefined> {
  try { const info = await stat(path); return info.isDirectory() ? 'directory' : info.isFile() ? 'file' : undefined; } catch { return undefined; }
}

function ancestors(directories: Iterable<string>): Set<string> {
  const all = new Set<string>();
  for (const directory of directories) for (let path = directory; !all.has(path); path = dirname(path)) { all.add(path); if (dirname(path) === path) break; }
  return all;
}

/** Candidate desktop-app data folders. Only existence and *.json/*.jsonl counts are reported, never contents. */
export function desktopCandidates(home: string, env: DoctorOptions['env']): Record<'darwin' | 'linux' | 'win32', { label: string; path: string }[]> {
  const support = join(home, 'Library', 'Application Support');
  const appData = env.APPDATA || join(home, 'AppData', 'Roaming');
  const localAppData = env.LOCALAPPDATA || join(home, 'AppData', 'Local');
  const config = env.XDG_CONFIG_HOME || join(home, '.config');
  return {
    darwin: ['Claude', 'Codex', 'com.openai.codex', 'OpenAI'].map((name) => ({ label: `~/Library/Application Support/${name}`, path: join(support, name) })),
    linux: ['Claude', 'Codex', 'OpenAI'].map((name) => ({ label: env.XDG_CONFIG_HOME ? `$XDG_CONFIG_HOME/${name}` : `~/.config/${name}`, path: join(config, name) })),
    win32: [
      { label: '%APPDATA%\\Claude', path: join(appData, 'Claude') },
      { label: '%LOCALAPPDATA%\\AnthropicClaude', path: join(localAppData, 'AnthropicClaude') },
      { label: '%APPDATA%\\Codex', path: join(appData, 'Codex') },
      { label: '%LOCALAPPDATA%\\Codex', path: join(localAppData, 'Codex') },
      { label: '%LOCALAPPDATA%\\OpenAI\\Codex', path: join(localAppData, 'OpenAI', 'Codex') },
    ],
  };
}

export async function runSourcesDoctor(options: DoctorOptions): Promise<string> {
  const { home, env, platform } = options;
  const now = options.now ?? Date.now();
  const out: string[] = [];
  const show = (path: string) => displayPath(path, home);
  const fromLabel = (root: SourceRoot) => root.from === 'default' ? 'default' : root.from === 'manifest' ? 'projects.yaml' : root.variable!;
  const recentFile = (file: { mtimeMs: number }) => now - file.mtimeMs < WEEK_MS;
  /** Folders seen by Codex and Claude, to check which Gemini hashes they explain. */
  const folders = new Set<string>([home]);

  out.push('Agent Village sources doctor · read-only, offline, no conversation text');
  out.push(`Window: last 7 days · paths relative to ~ · platform: ${platform}`);
  let manifestRoots: Partial<Record<SourceId, string[]>> = {};
  if (options.manifestPath) {
    const loaded = new ProjectManifestFile(options.manifestPath, home).read();
    out.push(`projects.yaml: ${loaded.error ? `invalid (${loaded.error})` : loaded.manifest ? 'read' : 'absent'}`);
    manifestRoots = loaded.manifest?.sources ?? {};
    for (const rule of loaded.manifest?.rules ?? []) for (const path of rule.paths) folders.add(path);
  }
  const context = { home, env, manifestRoots };
  const header = (source: SessionSource) => { out.push(''); out.push(`${source.label} [${source.experimental ? 'experimental' : 'supported'}]`); };
  const rootLine = async (root: SourceRoot) => {
    const kind = await exists(root.path);
    out.push(`  root ${show(root.path)} (${fromLabel(root)}) · ${kind === 'directory' ? 'exists' : kind ? 'not a directory' : 'missing'}`);
    return kind === 'directory';
  };

  // Codex: index, rollout files, origin strings from session_meta, approval-request events.
  header(codexSource);
  for (const root of codexSource.roots(context)) {
    if (!await rootLine(root)) continue;
    const database = join(root.path, 'state_5.sqlite');
    if (await exists(database)) {
      try {
        const { stdout } = await execute('sqlite3', ['-readonly', '-json', database,
          "SELECT count(*) AS threads FROM threads WHERE updated_at > strftime('%s','now')-604800"], { timeout: 3000, maxBuffer: 64 * 1024 });
        out.push(`    index state_5.sqlite: readable · ${Number((JSON.parse(stdout || '[]') as { threads?: number }[])[0]?.threads ?? 0)} threads updated in 7 days`);
        const { stdout: cwds } = await execute('sqlite3', ['-readonly', '-json', database,
          "SELECT DISTINCT cwd FROM threads WHERE updated_at > strftime('%s','now')-604800 LIMIT 500"], { timeout: 3000, maxBuffer: 512 * 1024 });
        for (const row of JSON.parse(cwds || '[]') as { cwd?: unknown }[]) if (typeof row.cwd === 'string' && row.cwd.startsWith('/')) folders.add(row.cwd);
      } catch { out.push('    index state_5.sqlite: present but unreadable (is sqlite3 installed?)'); }
    } else out.push('    index state_5.sqlite: missing (rollout files are read directly)');
    const rollouts = (await findFiles(join(root.path, 'sessions'), (name) => name.endsWith('.jsonl'))).filter(recentFile)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const origins: Counter = new Map();
    const raw: Counter = new Map();
    let failures = 0;
    let approvals = 0;
    let withApprovals = 0;
    for (const [index, file] of rollouts.slice(0, ORIGIN_SAMPLE).entries()) {
      try {
        const head = await readHeadLine(file.path);
        const meta = head ? parseTranscript(head, 'codex') : undefined;
        if (!meta?.client && !meta?.cwd) failures++;
        if (meta?.cwd?.startsWith('/')) folders.add(meta.cwd);
        bump(origins, codexOrigin(meta?.client?.originator, meta?.client?.source));
        bump(raw, `${meta?.client?.originator ?? '(none)'}/${meta?.client?.source ?? '(none)'}`);
        if (index < APPROVAL_SAMPLE) {
          const events = parseTranscript((await readTail(file.path)).text, 'codex').approvalEvents ?? 0;
          approvals += events;
          if (events) withApprovals++;
        }
      } catch { failures++; }
    }
    out.push(`    rollout files (7 days): ${rollouts.length}${rollouts.length > ORIGIN_SAMPLE ? ` (first ${ORIGIN_SAMPLE} inspected)` : ''} · parse failures: ${failures}`);
    out.push(`    origins: ${list(origins)}`);
    out.push(`    raw originator/source: ${list(raw)}`);
    out.push(`    approval-request events (exec_approval_request, apply_patch_approval_request): ${approvals} in ${withApprovals} of ${Math.min(rollouts.length, APPROVAL_SAMPLE)} recent rollouts`);
  }

  // Claude Code: journals, process records, entrypoint strings, installed hooks.
  header(claudeSource);
  for (const root of claudeSource.roots(context)) {
    if (!await rootLine(root)) continue;
    const journals = (await findFiles(join(root.path, 'projects'), (name) => CLAUDE_JOURNAL.test(name), 1)).filter(recentFile)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    let processes = 0;
    try { processes = (await readdir(join(root.path, 'sessions'))).filter((name) => /^\d+\.json$/.test(name)).length; } catch { /* None. */ }
    const origins: Counter = new Map();
    const raw: Counter = new Map();
    let failures = 0;
    for (const file of journals.slice(0, ORIGIN_SAMPLE)) {
      try {
        // The last 64 KiB is enough: every journal line repeats cwd and entrypoint.
        const lines = (await readTail(file.path, 64 * 1024)).text.split('\n');
        let parsed = 0;
        let entrypoint: string | undefined;
        for (const line of lines) {
          let row: Record<string, unknown>;
          try { row = JSON.parse(line); } catch { continue; }
          parsed++;
          if (typeof row.cwd === 'string' && row.cwd.startsWith('/')) folders.add(row.cwd);
          entrypoint = clientValue(row.entrypoint) ?? entrypoint;
        }
        if (!parsed) failures++;
        bump(origins, claudeOrigin(entrypoint));
        bump(raw, entrypoint ?? '(none)');
      } catch { failures++; }
    }
    out.push(`    journals (7 days): ${journals.length}${journals.length > ORIGIN_SAMPLE ? ` (first ${ORIGIN_SAMPLE} inspected)` : ''} · parse failures: ${failures} · process records: ${processes}`);
    out.push(`    origins: ${list(origins)}`);
    out.push(`    raw entrypoint: ${list(raw)}`);
    let hooks = '    hooks: settings.json missing · run npm run connect:claude to receive approval and input signals';
    try {
      const settings = JSON.parse(await readFile(join(root.path, 'settings.json'), 'utf8')) as { hooks?: Record<string, { hooks?: { command?: string }[] }[]> };
      const installed = CLAUDE_HOOK_EVENTS.filter((event) => (settings.hooks?.[event] ?? []).some((group) => (group.hooks ?? []).some((hook) => hook.command?.includes(MARKER))));
      const missing = CLAUDE_HOOK_EVENTS.filter((event) => !installed.includes(event));
      hooks = `    hooks: installed for ${installed.length}/${CLAUDE_HOOK_EVENTS.length} events${missing.length ? ` · missing: ${missing.join(', ')} · run npm run connect:claude` : ''}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') hooks = '    hooks: settings.json unreadable';
    }
    out.push(hooks);
  }

  // Gemini CLI: project folders, chat files, hashes explained by folders seen above.
  header(geminiSource);
  const candidates = new Map([...ancestors(folders)].map((path) => [geminiProjectHash(path), path]));
  for (const root of geminiSource.roots(context)) {
    if (!await rootLine(root)) continue;
    const files = await geminiFiles(root.path) ?? [];
    const projects = new Set(files.map((file) => file.hash));
    const hashed = [...projects].filter((name) => GEMINI_HASH.test(name));
    const recentFiles = files.filter(recentFile);
    let failures = 0;
    let sessions = 0;
    for (const file of recentFiles.slice(0, ORIGIN_SAMPLE)) {
      try { sessions += (await readGeminiFile(file)).length; } catch { failures++; }
    }
    const resolved = hashed.filter((hash) => candidates.has(hash)).length;
    out.push(`    project folders: ${projects.size} (${hashed.length} hashed, ${projects.size - hashed.length} other names) · files (7 days): ${recentFiles.filter((file) => file.kind === 'chat').length} chats, ${recentFiles.filter((file) => file.kind === 'logs').length} logs.json · sessions: ${sessions} · parse failures: ${failures}`);
    out.push(`    hashes resolved: ${resolved} of ${hashed.length} · unresolved: ${hashed.length - resolved} (matched against ${candidates.size} folders from Codex, Claude, projects.yaml and their parents; Git roots are tried by the server only)`);
  }

  // Desktop apps: existence and file counts only.
  const desktop = desktopCandidates(home, env);
  const current = platform === 'darwin' || platform === 'linux' || platform === 'win32' ? platform : undefined;
  out.push('');
  out.push(`Desktop app folders (${current ?? `${platform}: none known`}) · existence and *.json/*.jsonl counts only, contents never read`);
  for (const candidate of current ? desktop[current] : []) {
    if (await exists(candidate.path) !== 'directory') { out.push(`  ${candidate.label} · missing`); continue; }
    const files = await findFiles(candidate.path, (name) => name.endsWith('.json') || name.endsWith('.jsonl'), 6);
    out.push(`  ${candidate.label} · exists · ${files.filter((file) => file.path.endsWith('.jsonl')).length} *.jsonl, ${files.filter((file) => file.path.endsWith('.json')).length} *.json (${files.filter(recentFile).length} changed in 7 days)`);
  }
  const others = (Object.keys(desktop) as (keyof typeof desktop)[]).filter((name) => name !== current);
  out.push(`  not checked on this computer: ${others.map((name) => `${name} (${desktop[name].map((entry) => entry.label).join(', ')})`).join('; ')}`);
  out.push('');
  out.push('Not on disk: Codex cloud tasks, Claude Code on the web and Claude app chats; add them as links in projects.yaml.');
  out.push('Send this output back as is: it holds folder names relative to ~, counts and client identifiers only.');
  return out.join('\n');
}

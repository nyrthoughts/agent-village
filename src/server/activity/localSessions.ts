import { execFile } from 'node:child_process';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ObservedSession } from '../../shared/observation.js';
import { parseTranscript, projectId, type TranscriptSnapshot } from './projectObserver.js';

const execute = promisify(execFile);
type RecordData = Record<string, any>;
interface Options { home?: string; aliases?: Record<string, string> }
interface Snapshot { sessions: ObservedSession[]; errors: string[] }
const WEEK = 7 * 24 * 60 * 60 * 1000;

export class LocalSessions {
  private readonly home: string;
  private readonly transcripts = new Map<string, { signature: string; data: TranscriptSnapshot }>();
  private readonly projects = new Map<string, { key: string; name: string }>();
  private pending?: Promise<Snapshot>;
  private cached?: { at: number; value: Snapshot };
  constructor(private readonly options: Options = {}) { this.home = options.home ?? homedir(); }

  async snapshot(): Promise<Snapshot> {
    if (this.cached && Date.now() - this.cached.at < 5000) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.collect().then((value) => { this.cached = { at: Date.now(), value }; return value; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async transcript(path: string, tool: 'codex' | 'claude'): Promise<TranscriptSnapshot> {
    const info = await stat(path);
    const signature = `${info.mtimeMs}:${info.size}`;
    const cached = this.transcripts.get(path);
    if (cached?.signature === signature) return cached.data;
    const handle = await open(path, 'r');
    let input: string;
    try {
      const length = Math.min(info.size, 4 * 1024 * 1024);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, info.size - length);
      input = buffer.subarray(0, bytesRead).toString('utf8');
      if (info.size > length) input = input.slice(input.indexOf('\n') + 1);
    } finally { await handle.close(); }
    const data = parseTranscript(input, tool);
    this.transcripts.set(path, { signature, data });
    if (this.transcripts.size > 150) this.transcripts.delete(this.transcripts.keys().next().value!);
    return data;
  }

  private async project(cwd: string, sessionId = '', title = ''): Promise<{ key: string; name: string }> {
    const sessionAlias = this.options.aliases?.[`session:${sessionId}`]
      ?? Object.entries(this.options.aliases ?? {}).find(([key]) => key.startsWith('title:') && title.startsWith(key.slice(6)))?.[1];
    if (sessionAlias) return { key: `alias:${sessionAlias}`, name: sessionAlias };
    const cached = this.projects.get(cwd);
    if (cached) return cached;
    let key = cwd.includes('/.claude/worktrees/') ? cwd.split('/.claude/worktrees/')[0]! : cwd;
    try {
      const { stdout } = await execute('git', ['-C', key, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { timeout: 1500, maxBuffer: 4096 });
      const gitDir = stdout.trim();
      if (gitDir.endsWith('/.git')) key = dirname(gitDir);
    } catch { /* Non-repository task directories retain their own identity. */ }
    const alias = this.options.aliases?.[cwd] ?? this.options.aliases?.[key];
    const result = { key: alias ? `alias:${alias}` : key, name: alias ?? (key === this.home ? 'Sessions personnelles' : basename(key)) };
    this.projects.set(cwd, result);
    return result;
  }

  private async collect(): Promise<Snapshot> {
    const errors: string[] = [];
    const sessions: ObservedSession[] = [];
    const codexRoot = join(this.home, '.codex');
    try {
      const { stdout } = await execute('sqlite3', ['-readonly', '-json', join(codexRoot, 'state_5.sqlite'),
        "SELECT id, coalesce(nullif(name,''),title) AS title,cwd,rollout_path,updated_at FROM threads WHERE archived=0 AND (agent_path IS NULL OR agent_path='/root') AND updated_at > strftime('%s','now')-604800 ORDER BY updated_at DESC LIMIT 60"], { timeout: 3000, maxBuffer: 512 * 1024 });
      const rows = JSON.parse(stdout || '[]') as RecordData[];
      for (const row of rows) {
        if (typeof row.rollout_path !== 'string' || !resolve(row.rollout_path).startsWith(`${codexRoot}/sessions/`)) continue;
        try {
          const parsed = await this.transcript(row.rollout_path, 'codex');
          const project = await this.project(row.cwd, `codex:${row.id}`, String(row.title ?? ''));
          const lastActivityAt = parsed.lastActivityAt ?? new Date(row.updated_at * 1000).toISOString();
          // An old task_started event cannot establish that a process is still running.
          const state = Date.now() - Date.parse(lastActivityAt) > 120_000 ? 'idle' : parsed.state;
          sessions.push({ ...parsed, id: `codex:${row.id}`, tool: 'codex', role: 'lead',
            projectKey: project.key, project: project.name, attachedTaskId: projectId(project.key),
            title: String(row.title || 'Codex').slice(0, 120), lastActivityAt, state,
            sourceNote: 'Journal Codex local · état du dernier événement, pas une preuve de livraison' });
        } catch { if (!errors.includes('Codex : certains journaux sont illisibles')) errors.push('Codex : certains journaux sont illisibles'); }
      }
    } catch { errors.push('Codex : index local inaccessible'); }

    const claudeRoot = join(this.home, '.claude');
    const running = new Map<string, RecordData>();
    try {
      for (const file of await readdir(join(claudeRoot, 'sessions'))) {
        // Explicit allowlist: never open peer keys or auth files.
        if (!/^\d+\.json$/.test(file)) continue;
        try {
          const record = JSON.parse(await readFile(join(claudeRoot, 'sessions', file), 'utf8')) as RecordData;
          if (!Number.isInteger(record.pid) || typeof record.sessionId !== 'string') continue;
          process.kill(record.pid, 0);
          running.set(record.sessionId, record);
        } catch { /* Ignore exited processes and partial writes. */ }
      }
    } catch { /* Older Claude versions have only transcripts. */ }
    try {
      const candidates: { path: string; id: string; modified: number }[] = [];
      const root = join(claudeRoot, 'projects');
      for (const directory of await readdir(root, { withFileTypes: true })) {
        if (!directory.isDirectory()) continue;
        for (const file of await readdir(join(root, directory.name), { withFileTypes: true })) {
          if (!file.isFile() || !/^[a-zA-Z0-9-]+\.jsonl$/.test(file.name)) continue;
          const id = file.name.slice(0, -6);
          const path = join(root, directory.name, file.name);
          const info = await stat(path);
          if (running.has(id) || Date.now() - info.mtimeMs < WEEK) candidates.push({ id, path, modified: info.mtimeMs });
        }
      }
      candidates.sort((a, b) => Number(running.has(b.id)) - Number(running.has(a.id)) || b.modified - a.modified);
      const seen = new Set<string>();
      for (const candidate of candidates.slice(0, 60)) {
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        try {
          const parsed = await this.transcript(candidate.path, 'claude');
          const live = running.get(candidate.id);
          if (!parsed.summary && !parsed.objective && !live) continue;
          const project = await this.project(live?.cwd ?? parsed.cwd ?? dirname(candidate.path), `claude:${candidate.id}`, String(live?.name ?? ''));
          const lastActivityAt = parsed.lastActivityAt ?? new Date(candidate.modified).toISOString();
          sessions.push({ ...parsed, id: `claude:${candidate.id}`, tool: 'claude', role: 'lead',
            projectKey: project.key, project: project.name, attachedTaskId: projectId(project.key),
            title: String(live?.name ?? parsed.objective ?? 'Claude Code').slice(0, 120), lastActivityAt,
            state: live ? live.status === 'busy' ? 'working' : live.status === 'idle' ? 'waiting' : 'unknown' : 'idle',
            terminal: typeof live?.tmux === 'string' ? live.tmux : undefined,
            sourceNote: live ? `Processus Claude présent · statut déclaré : ${String(live.status ?? 'non fourni').slice(0, 40)}` : 'Historique Claude · aucun processus associé confirmé' });
        } catch { if (!errors.includes('Claude : certains journaux sont illisibles')) errors.push('Claude : certains journaux sont illisibles'); }
      }
    } catch { errors.push('Claude : journaux locaux inaccessibles'); }
    return { sessions, errors };
  }
}

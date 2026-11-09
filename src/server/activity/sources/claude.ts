import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { clientValue } from '../projectObserver.js';
import { claudeOrigin } from './origin.js';
import { buildRoots, recent, SESSION_LIMIT, WEEK_MS, type SessionSource, type SourceCollection, type SourceContext } from './types.js';

type Row = Record<string, any>;
const UNREADABLE = 'Claude : certains journaux sont illisibles';
export const CLAUDE_JOURNAL = /^[a-zA-Z0-9-]+\.jsonl$/;

/** Allowlisted process metadata below `<root>/sessions`; never opens peer keys or auth files. */
async function runningProcesses(root: string): Promise<Map<string, Row>> {
  const running = new Map<string, Row>();
  let files: string[];
  try { files = await readdir(join(root, 'sessions')); } catch { return running; } // Older Claude versions have only transcripts.
  for (const file of files) {
    if (!/^\d+\.json$/.test(file)) continue;
    try {
      const record = JSON.parse(await readFile(join(root, 'sessions', file), 'utf8')) as Row;
      if (!Number.isInteger(record.pid) || typeof record.sessionId !== 'string') continue;
      process.kill(record.pid, 0);
      const recordedAt = record.updatedAt;
      const recordedMs = typeof recordedAt === 'number' ? recordedAt < 10_000_000_000 ? recordedAt * 1000 : recordedAt
        : typeof recordedAt === 'string' ? Date.parse(recordedAt) : NaN;
      const modifiedAt = (await stat(join(root, 'sessions', file))).mtimeMs;
      record.statusObservedAt = new Date(Number.isFinite(recordedMs) ? recordedMs : modifiedAt).toISOString();
      running.set(record.sessionId, record);
    } catch { /* Ignore exited processes and partial writes. */ }
  }
  return running;
}

export const claudeSource: SessionSource = {
  id: 'claude',
  label: 'Claude Code',
  experimental: false,
  roots: (context) => buildRoots(context, 'claude', { variable: 'CLAUDE_CONFIG_DIR', fallback: '~/.claude' }, 'VILLAGE_CLAUDE_DIRS'),

  async collect(context: SourceContext): Promise<SourceCollection> {
    const result: SourceCollection = { leads: [], helpers: [], errors: [], coverage: [], rootsFound: 0, rootsChecked: 0 };
    const running = new Map<string, Row>();
    const candidates: { path: string; id: string; modified: number }[] = [];
    for (const root of this.roots(context)) {
      result.rootsChecked++;
      try { if (!(await stat(root.path)).isDirectory()) continue; } catch { continue; }
      result.rootsFound++;
      for (const [id, record] of await runningProcesses(root.path)) if (!running.has(id)) running.set(id, record);
      const projects = join(root.path, 'projects');
      let directories;
      try { directories = await readdir(projects, { withFileTypes: true }); } catch {
        // A root with process metadata but no journals is not an error; a root with neither is.
        try { await stat(join(root.path, 'sessions')); } catch { result.errors.push('Claude : journaux locaux inaccessibles'); }
        continue;
      }
      try {
        for (const directory of directories) {
          if (!directory.isDirectory()) continue;
          for (const file of await readdir(join(projects, directory.name), { withFileTypes: true })) {
            if (!file.isFile() || !CLAUDE_JOURNAL.test(file.name)) continue;
            const id = file.name.slice(0, -6);
            const path = join(projects, directory.name, file.name);
            const info = await stat(path);
            if (running.has(id) || context.now - info.mtimeMs < WEEK_MS) candidates.push({ id, path, modified: info.mtimeMs });
          }
        }
      } catch { result.errors.push('Claude : journaux locaux inaccessibles'); }
    }
    // Running processes first; those may be older than seven days.
    candidates.sort((a, b) => Number(running.has(b.id)) - Number(running.has(a.id)) || b.modified - a.modified);
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.size >= SESSION_LIMIT) break;
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      try {
        const { firstRequest, repository: _repository, client, attention: _attention, approvalEvents: _approvals, sessionId: _sessionId, cwd: journalCwd, ...parsed } = await context.journals.transcript(candidate.path, 'claude');
        const live = running.get(candidate.id);
        if (!parsed.summary && !parsed.objective && !live) continue;
        const cwd = typeof live?.cwd === 'string' && live.cwd ? live.cwd : journalCwd || undefined;
        const lastActivityAt = parsed.lastActivityAt ?? new Date(candidate.modified).toISOString();
        const freshProcess = live && typeof live.statusObservedAt === 'string' && recent(live.statusObservedAt, context.now);
        const id = `claude:${candidate.id}`;
        result.leads.push({
          // Without a recorded folder the session goes to Unassigned instead of a folder named after the journal directory.
          facts: { id, cwd, titles: [typeof live?.name === 'string' ? live.name : '', firstRequest ?? ''] },
          session: { ...parsed, id, tool: 'claude', role: 'lead',
            title: String(live?.name ?? parsed.objective ?? 'Claude Code').slice(0, 120), lastActivityAt,
            origin: claudeOrigin(client?.entrypoint ?? clientValue(live?.entrypoint)),
            state: live ? freshProcess ? live.status === 'busy' ? 'working' : live.status === 'idle' ? 'waiting' : 'unknown' : 'unknown' : 'idle',
            activityEvidence: freshProcess
              // Process presence is checked now; the declared state retains its own timestamp.
              ? { level: 'confirmed', source: 'claude-process', observedAt: live.statusObservedAt }
              : live ? { level: 'detected', source: 'claude-process', observedAt: live.statusObservedAt }
                : { level: recent(lastActivityAt, context.now) ? 'recent' : 'detected', source: 'claude-journal', observedAt: lastActivityAt },
            terminal: typeof live?.tmux === 'string' ? live.tmux : undefined,
            sourceNote: live ? `Processus Claude présent · statut déclaré : ${String(live.status ?? 'non fourni').slice(0, 40)}` : 'Historique Claude · aucun processus associé confirmé' },
        });
      } catch { if (!result.errors.includes(UNREADABLE)) result.errors.push(UNREADABLE); }
    }
    return result;
  },
};

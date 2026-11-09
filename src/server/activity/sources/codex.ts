import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { normalizeRemote } from '../projectResolver.js';
import { redactTitle } from '../redact.js';
import { findFiles } from './journal.js';
import { codexOrigin } from './origin.js';
import { buildRoots, recent, SESSION_LIMIT, WEEK_MS, type CollectedLead, type CollectedSession, type SessionSource, type SourceCollection, type SourceContext } from './types.js';

const execute = promisify(execFile);
type Row = Record<string, any>;
const HELPER_LIMIT = 200;
const HELPER_DEPTH = 8;
export const CODEX_HELPER_LIMIT_NOTE = 'Codex : couverture des sous-agents limitée par le plafond de collecte.';
export const CODEX_INDEX_MISSING_NOTE = 'Codex : index absent, journaux lus directement (sans titres ni sous-agents).';
const UNREADABLE = 'Codex : certains journaux sont illisibles';
const ROLLOUT = /^rollout-.*\.jsonl$/;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,120}$/;

function sqlString(value: string): string { return `'${value.replace(/'/g, "''")}'`; }

interface Candidate {
  id: string;
  title?: string;
  cwd?: string;
  rolloutPath: string;
  updatedMs: number;
  gitOrigin?: string;
  sourceColumn?: string;
  database?: string;
}

/** Codex sessions from the read-only SQLite index, or the rollout files themselves when a root has no index. */
async function indexed(root: string): Promise<Candidate[] | undefined> {
  const database = join(root, 'state_5.sqlite');
  try {
    // Newer Codex indexes record the origin URL per thread; older ones do not have the column.
    const { stdout: columnsJson } = await execute('sqlite3', ['-readonly', '-json', database, "SELECT name FROM pragma_table_info('threads')"], { timeout: 3000, maxBuffer: 64 * 1024 });
    const columns = new Set((JSON.parse(columnsJson || '[]') as Row[]).map((column) => column.name));
    if (!columns.has('rollout_path')) return undefined;
    const optional = ['git_origin_url', 'source'].filter((column) => columns.has(column)).map((column) => `,${column}`).join('');
    const { stdout } = await execute('sqlite3', ['-readonly', '-json', database,
      `SELECT id, coalesce(nullif(name,''),title) AS title,cwd,rollout_path,updated_at${optional} FROM threads WHERE archived=0 AND (agent_path IS NULL OR agent_path='/root') AND updated_at > strftime('%s','now')-604800 ORDER BY updated_at DESC LIMIT ${SESSION_LIMIT}`], { timeout: 3000, maxBuffer: 512 * 1024 });
    const sessions = `${resolve(root)}/sessions/`;
    return (JSON.parse(stdout || '[]') as Row[]).flatMap((row) => {
      if (typeof row.id !== 'string' || !SAFE_ID.test(row.id) || typeof row.rollout_path !== 'string' || !resolve(row.rollout_path).startsWith(sessions)) return [];
      return [{ id: row.id, title: typeof row.title === 'string' ? row.title : undefined, cwd: typeof row.cwd === 'string' && row.cwd ? row.cwd : undefined,
        rolloutPath: row.rollout_path, updatedMs: Number(row.updated_at) * 1000, database,
        gitOrigin: typeof row.git_origin_url === 'string' ? row.git_origin_url : undefined,
        sourceColumn: typeof row.source === 'string' ? row.source : undefined }];
    });
  } catch { return undefined; }
}

async function scanned(root: string, now: number): Promise<Candidate[] | undefined> {
  try { if (!(await stat(join(root, 'sessions'))).isDirectory()) return undefined; } catch { return undefined; }
  // Resumed sessions append to their original day folder, so every day is listed; only the file time counts.
  const files = await findFiles(join(root, 'sessions'), (name) => ROLLOUT.test(name));
  return files.filter((file) => now - file.mtimeMs < WEEK_MS).map((file) => {
    const uuid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(file.path)?.[1];
    return { id: uuid ?? basename(file.path, '.jsonl'), rolloutPath: file.path, updatedMs: file.mtimeMs };
  });
}

export const codexSource: SessionSource = {
  id: 'codex',
  label: 'Codex',
  experimental: false,
  roots: (context) => buildRoots(context, 'codex', { variable: 'CODEX_HOME', fallback: '~/.codex' }, 'VILLAGE_CODEX_HOMES'),

  async collect(context: SourceContext): Promise<SourceCollection> {
    const result: SourceCollection = { leads: [], helpers: [], errors: [], coverage: [], rootsFound: 0, rootsChecked: 0 };
    const candidates: Candidate[] = [];
    const databases = new Set<string>();
    for (const root of this.roots(context)) {
      result.rootsChecked++;
      try { if (!(await stat(root.path)).isDirectory()) continue; } catch { continue; }
      result.rootsFound++;
      const fromIndex = await indexed(root.path);
      if (fromIndex) { candidates.push(...fromIndex); databases.add(join(root.path, 'state_5.sqlite')); continue; }
      const fromFiles = await scanned(root.path, context.now);
      if (!fromFiles) { result.errors.push('Codex : index local inaccessible'); continue; }
      candidates.push(...fromFiles);
      if (!result.coverage.includes(CODEX_INDEX_MISSING_NOTE)) result.coverage.push(CODEX_INDEX_MISSING_NOTE);
    }
    candidates.sort((a, b) => b.updatedMs - a.updatedMs);
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (result.leads.length >= SESSION_LIMIT) break;
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      try {
        const { firstRequest, repository, client, approvalEvents: _approvals, sessionId: recordedId, cwd: recordedCwd, ...parsed } = await context.journals.transcript(candidate.rolloutPath, 'codex');
        // Without the index, a helper's rollout looks like any other; its session_meta says it is a sub-agent.
        if (!candidate.database && client?.source && /sub_?agent/i.test(client.source)) continue;
        const id = `codex:${candidate.database ? candidate.id : recordedId ?? candidate.id}`;
        const lastActivityAt = parsed.lastActivityAt ?? new Date(candidate.updatedMs).toISOString();
        // An old task_started event cannot establish that a process is still running.
        const state = context.now - Date.parse(lastActivityAt) > 120_000 ? 'idle' : parsed.state;
        const title = (candidate.title || redactTitle(firstRequest ?? '') || 'Codex').slice(0, 120);
        const lead: CollectedLead = {
          facts: { id, cwd: candidate.cwd ?? recordedCwd, titles: [candidate.title ?? '', firstRequest ?? ''],
            recordedRemote: (candidate.gitOrigin ? normalizeRemote(candidate.gitOrigin) : undefined) ?? repository },
          session: { ...parsed, id, tool: 'codex', role: 'lead', title, lastActivityAt, state,
            origin: codexOrigin(client?.originator, client?.source ?? candidate.sourceColumn),
            activityEvidence: { level: recent(lastActivityAt, context.now) ? 'recent' : 'detected', source: 'codex-journal', observedAt: lastActivityAt },
            sourceNote: 'Journal Codex local · état du dernier événement, pas une preuve de livraison' },
        };
        result.leads.push(lead);
      } catch { if (!result.errors.includes(UNREADABLE)) result.errors.push(UNREADABLE); }
    }
    for (const database of databases) await helpers(database, result);
    return result;
  },
};

/** Bounded breadth-first metadata only. An open edge does not imply a running process. Child journals are never read. */
async function helpers(database: string, result: SourceCollection): Promise<void> {
  const leads = result.leads.filter((lead) => lead.session.id.startsWith('codex:')).map((lead) => lead.session.id.slice('codex:'.length));
  const known = new Set([...leads, ...result.helpers.map((helper) => helper.id.slice('codex:'.length))]);
  let frontier = leads;
  const visited = new Set(known);
  let helperCount = result.helpers.length;
  try {
    for (let depth = 1; depth <= HELPER_DEPTH && frontier.length > 0; depth++) {
      const remaining = HELPER_LIMIT - helperCount;
      if (remaining <= 0) break;
      const { stdout } = await execute('sqlite3', ['-readonly', '-json', database,
        `SELECT e.parent_thread_id AS parent_id,e.child_thread_id AS id,
          substr(coalesce(nullif(t.name,''),t.title),1,120) AS title,t.updated_at
        FROM thread_spawn_edges e JOIN threads t ON t.id=e.child_thread_id
        WHERE e.parent_thread_id IN (${frontier.map(sqlString).join(',')})
          AND e.child_thread_id NOT IN (${[...visited].map(sqlString).join(',')})
        ORDER BY t.updated_at DESC,e.child_thread_id LIMIT ${remaining + 1}`], { timeout: 3000, maxBuffer: 256 * 1024 });
      const rows = JSON.parse(stdout || '[]') as Row[];
      const parents = new Set(frontier);
      frontier = [];
      if (rows.length > remaining && !result.coverage.includes(CODEX_HELPER_LIMIT_NOTE)) result.coverage.push(CODEX_HELPER_LIMIT_NOTE);
      for (const row of rows.slice(0, remaining)) {
        const updatedMs = Number(row.updated_at) * 1000;
        if (!parents.has(row.parent_id) || typeof row.id !== 'string' || !SAFE_ID.test(row.id)
          || (typeof row.updated_at !== 'number' && typeof row.updated_at !== 'string')
          || visited.has(row.id) || !Number.isFinite(updatedMs) || updatedMs < 0 || updatedMs > 8.64e15) continue;
        const lastActivityAt = new Date(updatedMs).toISOString();
        const child: CollectedSession = { id: `codex:${row.id}`, parentId: `codex:${row.parent_id}`, tool: 'codex', role: 'helper',
          state: 'unknown', lastActivityAt, title: redactTitle(typeof row.title === 'string' ? row.title : '') || 'Codex helper', history: [],
          activityEvidence: { level: recent(lastActivityAt) ? 'recent' : 'detected', source: 'codex-index', observedAt: lastActivityAt },
          sourceNote: 'Sous-agent Codex détecté dans l’index local · activité non confirmée' };
        result.helpers.push(child); visited.add(row.id); frontier.push(row.id); helperCount++;
      }
      if (helperCount >= HELPER_LIMIT || (depth === HELPER_DEPTH && frontier.length > 0)) {
        if (!result.coverage.includes(CODEX_HELPER_LIMIT_NOTE)) result.coverage.push(CODEX_HELPER_LIMIT_NOTE);
        break;
      }
    }
  } catch {
    if (!result.errors.includes('Codex : index des sous-agents inaccessible')) result.errors.push('Codex : index des sous-agents inaccessible');
    const note = 'Codex : sous-agents partiellement ou non détectés ; la collecte des parents reste disponible.';
    if (!result.coverage.includes(note)) result.coverage.push(note);
  }
}

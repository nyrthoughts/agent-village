import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ObservedUpdate } from '../../../shared/observation.js';
import { text } from '../projectObserver.js';
import { redactTitle } from '../redact.js';
import { readHead, readTail, TAIL_BYTES } from './journal.js';
import { buildRoots, recent, SESSION_LIMIT, WEEK_MS, type CollectedLead, type SessionSource, type SourceCollection, type SourceContext } from './types.js';

/**
 * Gemini CLI (experimental). Chats are saved as `<root>/tmp/<projectHash>/chats/*.json`, where the
 * project hash is the SHA-256 of the working directory; older versions keep user prompts only in
 * `<root>/tmp/<projectHash>/logs.json`. The working directory itself is not stored, so the
 * orchestrator matches the hash against folders known from other sources and the manifest.
 */
export const GEMINI_HASH = /^[a-f0-9]{64}$/;
const UNREADABLE = 'Gemini : certains historiques sont illisibles';
const SAFE_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const HEAD_BYTES = 64 * 1024;

export function geminiProjectHash(directory: string): string {
  return createHash('sha256').update(directory).digest('hex');
}

export interface GeminiChat {
  sessionId?: string;
  projectHash?: string;
  startTime?: string;
  lastUpdated?: string;
  userMessages: number;
  modelMessages: number;
  firstRequest?: string;
  objective?: string;
  summary?: string;
  history: ObservedUpdate[];
}

const isoTime = (value: unknown): string | undefined =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : undefined;

function partsText(content: unknown): string {
  // Content is a string or a list of parts ({ text }); tool calls, thoughts and inline data are ignored.
  if (Array.isArray(content)) return text(content.filter((part) => typeof part?.text === 'string').map((part) => ({ type: 'text', text: part.text })));
  return text(content);
}

/** Tolerant reader for one saved chat file. Only user and model text is kept; thoughts and tool calls are dropped. */
export function parseGeminiChat(raw: string): GeminiChat | undefined {
  let value: any;
  try { value = JSON.parse(raw); } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const chat: GeminiChat = { userMessages: 0, modelMessages: 0, history: [],
    sessionId: typeof value.sessionId === 'string' && SAFE_ID.test(value.sessionId) ? value.sessionId : undefined,
    projectHash: typeof value.projectHash === 'string' && GEMINI_HASH.test(value.projectHash) ? value.projectHash : undefined,
    startTime: isoTime(value.startTime), lastUpdated: isoTime(value.lastUpdated) };
  for (const message of Array.isArray(value.messages) ? value.messages : []) {
    const role = message?.type === 'user' ? 'request' : ['gemini', 'model'].includes(message?.type) ? 'report' : undefined;
    if (!role) continue;
    if (role === 'request') chat.userMessages++; else chat.modelMessages++;
    const at = isoTime(message.timestamp);
    const content = partsText(message.content);
    if (!content || !at) continue;
    if (role === 'request') { chat.objective = content; chat.firstRequest ??= content.slice(0, 240); } else chat.summary = content;
    chat.history.push({ at, kind: role, text: content });
    if (chat.history.length > 24) chat.history.shift();
  }
  return chat;
}

/** Metadata only, for a chat file larger than the read cap: no messages are parsed. */
export function geminiChatHeader(head: string): GeminiChat {
  const field = (name: string) => new RegExp(`"${name}"\\s*:\\s*"([^"]{1,120})"`).exec(head)?.[1];
  const sessionId = field('sessionId');
  return { userMessages: 0, modelMessages: 0, history: [], sessionId: sessionId && SAFE_ID.test(sessionId) ? sessionId : undefined,
    startTime: isoTime(field('startTime')), lastUpdated: isoTime(field('lastUpdated')) };
}

/** Older Gemini CLI versions: `logs.json` lists user prompts only, grouped here by session. */
export function parseGeminiLogs(raw: string): GeminiChat[] {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const sessions = new Map<string, GeminiChat>();
  for (const entry of value) {
    if (typeof entry?.sessionId !== 'string' || !SAFE_ID.test(entry.sessionId) || entry.type !== 'user') continue;
    const chat: GeminiChat = sessions.get(entry.sessionId) ?? { sessionId: entry.sessionId, userMessages: 0, modelMessages: 0, history: [] };
    chat.userMessages++;
    const at = isoTime(entry.timestamp);
    const content = text(entry.message);
    if (at) { chat.startTime ??= at; if (!chat.lastUpdated || at > chat.lastUpdated) chat.lastUpdated = at; }
    if (at && content) { chat.objective = content; chat.firstRequest ??= content.slice(0, 240); chat.history.push({ at, kind: 'request', text: content }); }
    if (chat.history.length > 24) chat.history.shift();
    sessions.set(entry.sessionId, chat);
  }
  return [...sessions.values()];
}

interface ChatFile { path: string; hash: string; mtimeMs: number; size: number; kind: 'chat' | 'logs' }

/** Lists chat files and logs below `<root>/tmp/<hash>/`. Directory names that are not hashes are still read. */
export async function geminiFiles(root: string): Promise<ChatFile[] | undefined> {
  let projects;
  try { projects = await readdir(join(root, 'tmp'), { withFileTypes: true }); } catch { return undefined; }
  const files: ChatFile[] = [];
  for (const project of projects) {
    if (!project.isDirectory() || project.name.startsWith('.')) continue;
    const base = join(root, 'tmp', project.name);
    const push = async (path: string, kind: ChatFile['kind']) => {
      try { const info = await stat(path); if (info.isFile()) files.push({ path, hash: project.name, mtimeMs: info.mtimeMs, size: info.size, kind }); } catch { /* Missing. */ }
    };
    await push(join(base, 'logs.json'), 'logs');
    let chats: string[] = [];
    try { chats = await readdir(join(base, 'chats')); } catch { /* No saved chats. */ }
    for (const name of chats) if (name.endsWith('.json')) await push(join(base, 'chats', name), 'chat');
  }
  return files;
}

export async function readGeminiFile(file: ChatFile): Promise<GeminiChat[]> {
  if (file.size > TAIL_BYTES) {
    if (file.kind === 'logs') return [];
    return [geminiChatHeader((await readHead(file.path, HEAD_BYTES)).text)];
  }
  const { text: raw } = await readTail(file.path);
  if (file.kind === 'logs') return parseGeminiLogs(raw);
  const chat = parseGeminiChat(raw);
  if (!chat) throw new Error('unreadable');
  return [chat];
}

export const geminiSource: SessionSource = {
  id: 'gemini',
  label: 'Gemini CLI',
  experimental: true,
  // No documented override of the Gemini CLI data directory is known; extra roots come from the owner.
  roots: (context) => buildRoots(context, 'gemini', { fallback: '~/.gemini' }, 'VILLAGE_GEMINI_DIRS'),

  async collect(context: SourceContext): Promise<SourceCollection> {
    const result: SourceCollection = { leads: [], helpers: [], errors: [], coverage: [], rootsFound: 0, rootsChecked: 0 };
    const files: ChatFile[] = [];
    for (const root of this.roots(context)) {
      result.rootsChecked++;
      try { if (!(await stat(root.path)).isDirectory()) continue; } catch { continue; }
      result.rootsFound++;
      files.push(...(await geminiFiles(root.path) ?? []).filter((file) => context.now - file.mtimeMs < WEEK_MS));
    }
    // Saved chats first so a session that also appears in logs.json keeps its replies.
    files.sort((a, b) => Number(a.kind === 'logs') - Number(b.kind === 'logs') || b.mtimeMs - a.mtimeMs);
    const sessions = new Map<string, CollectedLead>();
    for (const file of files) {
      let chats: GeminiChat[];
      try { chats = await context.journals.file(file.path, file, () => readGeminiFile(file)); } catch { if (!result.errors.includes(UNREADABLE)) result.errors.push(UNREADABLE); continue; }
      for (const chat of chats) {
        const sessionId = chat.sessionId ?? file.path.split('/').at(-1)!.replace(/\.json$/, '');
        if (!SAFE_ID.test(sessionId)) continue;
        const id = `gemini:${sessionId}`;
        if (sessions.has(id) || (!chat.objective && !chat.summary && chat.userMessages === 0)) continue;
        const lastActivityAt = chat.history.at(-1)?.at ?? chat.lastUpdated ?? new Date(file.mtimeMs).toISOString();
        const projectHash = chat.projectHash ?? file.hash;
        sessions.set(id, {
          projectHash,
          facts: { id, titles: [chat.firstRequest ?? ''] },
          session: { id, tool: 'gemini', role: 'lead', origin: 'cli', state: 'idle', lastActivityAt,
            title: (redactTitle(chat.firstRequest ?? '') || 'Gemini CLI').slice(0, 120),
            objective: chat.objective, summary: chat.summary, history: chat.history,
            activityEvidence: { level: recent(lastActivityAt, context.now) ? 'recent' : 'detected', source: 'gemini-chat', observedAt: lastActivityAt },
            sourceNote: 'Historique Gemini CLI local (expérimental) · aucun processus observé' },
        });
      }
    }
    result.leads = [...sessions.values()].sort((a, b) => b.session.lastActivityAt.localeCompare(a.session.lastActivityAt)).slice(0, SESSION_LIMIT);
    return result;
  },
};

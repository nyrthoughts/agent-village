import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTranscript, type TranscriptSnapshot } from '../projectObserver.js';

export const TAIL_BYTES = 4 * 1024 * 1024;
const HEAD_BYTES = 256 * 1024;

/** Reads at most `limit` bytes from the end of a file, dropping a partial first line. */
export async function readTail(path: string, limit = TAIL_BYTES): Promise<{ text: string; size: number; mtimeMs: number }> {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    const length = Math.min(info.size, limit);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, info.size - length);
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    if (info.size > length) text = text.slice(text.indexOf('\n') + 1);
    return { text, size: info.size, mtimeMs: info.mtimeMs };
  } finally { await handle.close(); }
}

/** Reads at most `limit` bytes from the start of a file. */
export async function readHead(path: string, limit = HEAD_BYTES): Promise<{ text: string; complete: boolean }> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    return { text: buffer.subarray(0, bytesRead).toString('utf8'), complete: bytesRead < limit };
  } finally { await handle.close(); }
}

/** Reads the first line of a file when it fits in a bounded head (Codex `session_meta`). */
export async function readHeadLine(path: string, limit = HEAD_BYTES): Promise<string | undefined> {
  const { text, complete } = await readHead(path, limit);
  const end = text.indexOf('\n');
  return end >= 0 ? text.slice(0, end) : complete ? text : undefined;
}

/** Parsed journal tails, reused while a file's size and modification time are unchanged. */
export class JournalCache {
  private readonly entries = new Map<string, { signature: string; data: TranscriptSnapshot }>();
  constructor(private readonly limit = 200) {}

  async transcript(path: string, tool: 'codex' | 'claude'): Promise<TranscriptSnapshot> {
    const info = await stat(path);
    const signature = `${info.mtimeMs}:${info.size}`;
    const cached = this.entries.get(path);
    if (cached?.signature === signature) return cached.data;
    const { text } = await readTail(path);
    let data = parseTranscript(text, tool);
    if (tool === 'codex' && info.size > TAIL_BYTES) {
      // The tail misses `session_meta` in long rollouts; its first line still carries cwd, origin and remote.
      const head = await readHeadLine(path).catch(() => undefined);
      if (head) {
        const meta = parseTranscript(head, 'codex');
        data = { ...data, cwd: data.cwd ?? meta.cwd, repository: data.repository ?? meta.repository,
          sessionId: data.sessionId ?? meta.sessionId, client: data.client ?? meta.client };
      }
    }
    this.entries.set(path, { signature, data });
    if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    return data;
  }
}

/** Bounded recursive listing: files whose name matches, at most `depth` levels and `max` entries visited. */
export async function findFiles(root: string, match: (name: string) => boolean, depth = 4, max = 20_000): Promise<{ path: string; mtimeMs: number; size: number }[]> {
  const found: { path: string; mtimeMs: number; size: number }[] = [];
  let visited = 0;
  const walk = async (directory: string, level: number): Promise<void> => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (++visited > max) return;
      const path = join(directory, entry.name);
      if (entry.isDirectory() && level < depth) await walk(path, level + 1);
      else if (entry.isFile() && match(entry.name)) {
        try { const info = await stat(path); found.push({ path, mtimeMs: info.mtimeMs, size: info.size }); } catch { /* Removed meanwhile. */ }
      }
    }
  };
  await walk(root, 0);
  return found;
}

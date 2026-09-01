import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import type { Worker, WorkerState } from '../../shared/activity.js';
import { redactTitle } from './redact.js';

export type CodexThreadStatus =
  | { type: 'active'; activeFlags: string[] }
  | { type: 'idle' | 'notLoaded' | 'systemError' };

export interface CodexThreadRecord {
  id: string;
  cwd: string;
  name: string | null;
  preview: string;
  updatedAt: number;
  status: CodexThreadStatus;
}

export interface AppServerTransport {
  request(method: string, params?: unknown): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  close(): Promise<void>;
}

const threadSchema = z.object({
  id: z.string().min(1),
  cwd: z.string(),
  name: z.string().nullable().optional().transform((value) => value ?? null),
  preview: z.string(),
  updatedAt: z.number(),
  status: z.discriminatedUnion('type', [
    z.object({ type: z.literal('active'), activeFlags: z.array(z.string()) }),
    z.object({ type: z.enum(['idle', 'notLoaded', 'systemError']) }),
  ]),
});
const threadListSchema = z.object({ data: z.array(threadSchema) });

class StdioAppServerTransport implements AppServerTransport {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  #nextId = 1;

  constructor(binary = process.env.CODEX_BIN ?? 'codex') {
    this.#child = spawn(binary, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: this.#child.stdout });
    lines.on('line', (line) => this.#receive(line));
    this.#child.once('error', (error) => this.#rejectAll(error));
    this.#child.once('exit', (code) => {
      if (code !== 0 && this.#pending.size > 0) this.#rejectAll(new Error(`Codex app-server exited with code ${code ?? 'unknown'}`));
    });
  }

  request(method: string, params: unknown = {}): Promise<unknown> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Codex app-server timed out on ${method}`));
      }, 3_000);
      this.#pending.set(id, { resolve, reject, timer });
      this.#child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  notify(method: string, params: unknown = {}): void {
    this.#child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async close(): Promise<void> {
    this.#child.stdin.end();
    if (this.#child.exitCode === null) this.#child.kill('SIGTERM');
  }

  #receive(line: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message ?? 'Codex app-server error'));
    else pending.resolve(message.result);
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

interface CodexProviderOptions {
  now?: () => Date;
  idleMinutes?: number;
  cacheMs?: number;
  createTransport?: () => Promise<AppServerTransport>;
}

export class CodexAppServerProvider {
  readonly #now: () => Date;
  readonly #idleMinutes: number;
  readonly #cacheMs: number;
  readonly #createTransport: () => Promise<AppServerTransport>;
  #cachedAt = 0;
  #cached: Worker[] = [];

  constructor(options: CodexProviderOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#idleMinutes = options.idleMinutes ?? 30;
    this.#cacheMs = options.cacheMs ?? 10_000;
    this.#createTransport = options.createTransport ?? (async () => new StdioAppServerTransport());
  }

  async read(): Promise<Worker[]> {
    const now = this.#now();
    if (this.#cachedAt > 0 && now.getTime() - this.#cachedAt < this.#cacheMs) return this.#cached;
    const transport = await this.#createTransport();
    try {
      await transport.request('initialize', {
        clientInfo: { name: 'agent_village', title: 'Agent Village', version: '0.1.0' },
        capabilities: {},
      });
      transport.notify('initialized');
      const response = await transport.request('thread/list', {
        limit: 100,
        sortKey: 'recency_at',
        sortDirection: 'desc',
        useStateDbOnly: true,
        sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown'],
      });
      const parsed = threadListSchema.safeParse(response);
      if (!parsed.success) throw new Error('Codex app-server returned an invalid thread list');
      this.#cached = mapCodexThreads(parsed.data.data, now, this.#idleMinutes);
      this.#cachedAt = now.getTime();
      return this.#cached;
    } finally {
      await transport.close();
    }
  }
}

function stateFor(status: CodexThreadStatus, updatedAt: Date, now: Date): WorkerState {
  if (status.type === 'active') {
    return status.activeFlags.length > 0 ? 'waiting' : 'working';
  }
  if (status.type === 'idle' && now.getTime() - updatedAt.getTime() <= 20_000) return 'working';
  if (status.type === 'idle' || status.type === 'notLoaded') return 'idle';
  return 'unknown';
}

export function mapCodexThreads(
  threads: readonly CodexThreadRecord[],
  now = new Date(),
  idleMinutes = 30,
): Worker[] {
  const cutoff = now.getTime() - idleMinutes * 60_000;
  return threads.flatMap((thread) => {
    const updatedAt = new Date(thread.updatedAt * 1000);
    if (thread.status.type !== 'active' && updatedAt.getTime() < cutoff) return [];
    const rawTitle = thread.name?.trim() || thread.preview.trim() || basename(thread.cwd) || 'Codex thread';
    return [{
      id: `codex:${thread.id}`,
      tool: 'codex' as const,
      state: stateFor(thread.status, updatedAt, now),
      project: redactTitle(basename(thread.cwd) || 'unknown').slice(0, 80),
      title: redactTitle(rawTitle).slice(0, 120),
      lastActivityAt: updatedAt.toISOString(),
    }];
  });
}

import type { SourceHealth } from '../../shared/board.js';

/** In-memory source health. Messages are short fixed diagnostics, never paths or payloads. */
export class HealthRegistry {
  readonly #sources = new Map<string, SourceHealth>();
  readonly #listeners = new Set<() => void>();
  constructor(private readonly now: () => Date = () => new Date()) {}

  register(source: Omit<SourceHealth, 'lastOkAt' | 'lastErrorAt' | 'lastError'>): void {
    if (!this.#sources.has(source.id)) this.#sources.set(source.id, { ...source });
  }

  ok(id: string, warning?: string, at = this.now()): void {
    this.#patch(id, { lastOkAt: at.toISOString(), warning, paused: false });
  }

  fail(id: string, message: string, at = this.now()): void {
    this.#patch(id, { lastErrorAt: at.toISOString(), lastError: message.slice(0, 160), paused: false });
  }

  pause(ids: readonly string[], paused: boolean): void {
    for (const id of ids) if (this.#sources.get(id)?.paused !== paused) this.#patch(id, { paused });
  }

  list(): SourceHealth[] {
    return [...this.#sources.values()].map((source) => ({ ...source }));
  }

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  #patch(id: string, patch: Partial<SourceHealth>): void {
    const current = this.#sources.get(id);
    if (!current) return;
    const next = Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([, value]) => value !== undefined)) as unknown as SourceHealth;
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    this.#sources.set(id, next);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Health reporting never fails a source. */ } }
  }
}

import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { ObservedSession } from '../../shared/observation.js';
import { snapshotEvents } from '../events/adapters.js';
import type { EventJournal } from '../events/journal.js';
import type { HealthRegistry } from './health.js';

export interface NativeCollector {
  snapshot(): Promise<{ sessions: ObservedSession[]; errors: string[] }>;
  refresh?(): Promise<{ sessions: ObservedSession[]; errors: string[] }>;
  roots?: { codex: string; claude: string };
}
export type WatchFactory = (path: string, recursive: boolean, onChange: () => void) => FSWatcher;

export const NATIVE_SOURCES = [
  { id: 'codex', label: 'Codex local', kind: 'poll' as const },
  { id: 'claude', label: 'Claude local', kind: 'poll' as const },
];

const defaultWatch: WatchFactory = (path, recursive, onChange) => fsWatch(path, { recursive, persistent: false }, () => onChange());

/**
 * Detection for local journals: fs.watch triggers a debounced refresh, a 5-second poll remains
 * the safety net, and refreshes never overlap (a change during a refresh schedules one more).
 * Collection is read-only; the snapshot is turned into events by diff against the projection.
 */
export class NativeRefresher {
  readonly #watchers = new Map<string, FSWatcher>();
  #running?: Promise<void>;
  #dirty = false;
  #debounce?: ReturnType<typeof setTimeout>;
  #interval?: ReturnType<typeof setInterval>;
  #active = false;
  /** Incremented by `stop()`: a collection started before it is discarded when it completes. */
  #generation = 0;
  refreshes = 0;

  constructor(private readonly options: {
    collector: NativeCollector;
    journal: Pick<EventJournal, 'state' | 'appendMany'>;
    health: HealthRegistry;
    pollMs?: number;
    debounceMs?: number;
    watch?: WatchFactory | false;
    /** Called before each poll; returning false pauses collection until the next start. */
    shouldContinue?: () => boolean;
  }) {
    for (const source of NATIVE_SOURCES) options.health.register({ ...source, cadenceMs: options.pollMs ?? 5_000 });
  }

  get active(): boolean { return this.#active; }

  /** Starts watching and polling; resolves after the first refresh. */
  start(): Promise<void> {
    if (!this.#active) {
      this.#active = true;
      this.options.health.pause(NATIVE_SOURCES.map((source) => source.id), false);
      this.#ensureWatchers();
      this.#interval = setInterval(() => {
        if (this.options.shouldContinue && !this.options.shouldContinue()) { this.stop(true); return; }
        this.#ensureWatchers();
        void this.run();
      }, this.options.pollMs ?? 5_000);
      this.#interval.unref?.();
    }
    return this.run();
  }

  stop(paused = false): void {
    this.#active = false;
    this.#generation++;
    this.#dirty = false;
    if (this.#interval) clearInterval(this.#interval);
    if (this.#debounce) clearTimeout(this.#debounce);
    this.#interval = undefined; this.#debounce = undefined;
    for (const watcher of this.#watchers.values()) watcher.close();
    this.#watchers.clear();
    if (paused) this.options.health.pause(NATIVE_SOURCES.map((source) => source.id), true);
  }

  /** Debounced change notification from a watcher. */
  trigger(): void {
    if (!this.#active) return;
    if (this.#debounce) clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => { this.#debounce = undefined; void this.run(); }, this.options.debounceMs ?? 250);
  }

  /** Serialized refresh: concurrent calls share the run and schedule exactly one follow-up. */
  run(): Promise<void> {
    if (this.#running) { this.#dirty = true; return this.#running; }
    // Never rejects: every failure becomes visible source health (timers call this with `void`).
    this.#running = this.#collect().catch(() => {
      for (const source of NATIVE_SOURCES) this.options.health.fail(source.id, 'collecte locale impossible');
    }).finally(() => {
      this.#running = undefined;
      if (this.#dirty && this.#active) { this.#dirty = false; void this.run(); }
    });
    return this.#running;
  }

  async #collect(): Promise<void> {
    const { collector, journal, health } = this.options;
    const generation = this.#generation;
    this.refreshes++;
    let snapshot: { sessions: ObservedSession[]; errors: string[] };
    try {
      snapshot = await (collector.refresh ? collector.refresh() : collector.snapshot());
    } catch {
      if (generation !== this.#generation) return;
      for (const source of NATIVE_SOURCES) health.fail(source.id, 'collecte locale impossible');
      return;
    }
    // Stopped (lock, revocation, shutdown) while reading: the late result is dropped.
    if (generation !== this.#generation) return;
    try {
      journal.appendMany(snapshotEvents(snapshot.sessions, journal.state));
    } catch {
      // A storage failure is not a successful refresh.
      for (const source of NATIVE_SOURCES) health.fail(source.id, 'journal local indisponible');
      return;
    }
    const watching = this.options.watch === false || this.#watchers.size > 0 ? undefined : 'Surveillance de fichiers indisponible · sondage 5 s';
    for (const source of NATIVE_SOURCES) {
      const prefix = source.id === 'codex' ? 'Codex' : 'Claude';
      const errors = snapshot.errors.filter((message) => message.startsWith(prefix));
      // Only an unreadable index or journal root makes the source unreachable; helper coverage notes are warnings.
      const fatal = errors.find((message) => message.includes('index local inaccessible') || message.includes('journaux locaux inaccessibles'));
      if (fatal) health.fail(source.id, fatal);
      else health.ok(source.id, errors[0] ?? watching);
    }
  }

  #ensureWatchers(): void {
    const roots = this.options.collector.roots;
    if (!roots || this.options.watch === false) return;
    const create = this.options.watch ?? defaultWatch;
    const targets: [string, boolean][] = [
      [join(roots.codex, 'sessions'), true], [roots.codex, false],
      [join(roots.claude, 'projects'), true], [join(roots.claude, 'sessions'), false],
    ];
    for (const [path, recursive] of targets) {
      if (this.#watchers.has(path)) continue;
      try {
        const watcher = create(path, recursive, () => this.trigger());
        watcher.on('error', () => { watcher.close(); this.#watchers.delete(path); });
        this.#watchers.set(path, watcher);
      } catch { /* Missing directory or unsupported platform: the 5-second poll covers it. */ }
    }
  }
}

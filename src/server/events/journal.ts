import { randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { eventInputSchema, parseVillageEvent, type EventInput, type VillageEvent } from '../../shared/events.js';
import { emptyState, reduce, reduceAll, type BoardState } from '../../shared/projector.js';
import { ensurePrivateDirectory } from '../auth/privateState.js';
import { KeyIndex } from './keyIndex.js';

export const RING_CAPACITY = 5_000;
export const RING_MAX_AGE_MS = 24 * 60 * 60_000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const FUTURE_TOLERANCE_MS = 5 * 60_000;
/** Beyond this many events awaiting the durable index, new appends are refused. */
const MAX_UNINDEXED = 10_000;

const entities = z.record(z.string(), z.unknown());
const checkpointSchema = z.object({
  version: z.literal(1),
  epoch: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  /** Every event up to this sequence is folded into `state`. */
  foldedSeq: z.number().int().min(0),
  /** Highest sequence ever assigned, so numbering stays monotone after compaction. */
  lastSeq: z.number().int().min(0),
  state: z.object({ seq: z.number().int().min(0), sessions: entities, updates: entities, facts: entities,
    projects: entities, mappings: entities, plans: entities, tasks: entities }).strict(),
}).strict();

export interface JournalOptions {
  directory: string;
  capacity?: number;
  maxAgeMs?: number;
  now?: () => Date;
  /** In-memory LRU of recent keys; the durable index on disk stays exact. */
  keyCacheSize?: number;
}

export class JournalClosedError extends Error {
  constructor() { super('journal_closed'); }
}
export type Replay = { kind: 'events'; events: VillageEvent[] } | { kind: 'reset' };
type Listener = (event: VillageEvent) => void;

function readPrivate(path: string): string | undefined {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.size > MAX_FILE_BYTES
      || (process.getuid && stat.uid !== process.getuid())) throw new Error('Event journal files must be private regular files (0600)');
    return readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
}

function writeAtomic(path: string, text: string): void {
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
  try { renameSync(temporary, path); }
  finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

/**
 * Append-only JSONL journal with a bounded in-memory replay ring.
 *
 * Events leaving the ring (capacity or age) are folded into a checkpoint state, so the
 * projection survives eviction and restart. Idempotence is exact and durable: every accepted
 * key is recorded in a private sharded hash index (`keys/`), independent of the ring and of the
 * bounded projection, so the same event is never journaled twice, even after both evicted it
 * and the server restarted. A new event that leaves the projection unchanged (for example a
 * delayed older CI status) is still a distinct fact and is journaled with its own sequence.
 * Sequence numbers are contiguous and monotone.
 */
export class EventJournal {
  readonly directory: string;
  readonly epoch: string;
  readonly #capacity: number;
  readonly #maxAgeMs: number;
  readonly #now: () => Date;
  readonly #eventsPath: string;
  readonly #checkpointPath: string;
  readonly #listeners = new Set<Listener>();
  readonly #index: KeyIndex;
  #ring: VillageEvent[] = [];
  /** Accepted events whose keys are not yet in the durable index (bounded by MAX_UNINDEXED). */
  #unindexed: VillageEvent[] = [];
  readonly #unindexedKeys = new Set<string>();
  #closed = false;
  /** Last durable-index failure, surfaced as a board error; the event itself was persisted. */
  indexError?: string;
  #base: BoardState;
  #state: BoardState;
  #foldedSeq = 0;
  #seq = 0;
  #fileLines = 0;
  #fd: number | undefined;
  rejected = 0;

  constructor(options: JournalOptions) {
    this.directory = ensurePrivateDirectory(options.directory);
    this.#capacity = Math.max(1, options.capacity ?? RING_CAPACITY);
    this.#maxAgeMs = options.maxAgeMs ?? RING_MAX_AGE_MS;
    this.#now = options.now ?? (() => new Date());
    this.#eventsPath = join(this.directory, 'events.jsonl');
    this.#checkpointPath = join(this.directory, 'checkpoint.json');
    this.#index = new KeyIndex(join(this.directory, 'keys'), { cacheSize: options.keyCacheSize });
    const rawCheckpoint = readPrivate(this.#checkpointPath);
    let epoch: string;
    if (rawCheckpoint === undefined) {
      epoch = randomBytes(16).toString('base64url');
      this.#base = emptyState();
      this.#writeCheckpoint(epoch);
    } else {
      // A corrupt checkpoint fails closed instead of silently restarting numbering.
      const checkpoint = checkpointSchema.parse(JSON.parse(rawCheckpoint));
      epoch = checkpoint.epoch;
      this.#base = checkpoint.state as unknown as BoardState;
      this.#foldedSeq = checkpoint.foldedSeq;
      this.#seq = Math.max(checkpoint.lastSeq, checkpoint.foldedSeq);
    }
    this.epoch = epoch;
    const rawEvents = readPrivate(this.#eventsPath) ?? '';
    const fileEvents: VillageEvent[] = [];
    for (const line of rawEvents.split('\n')) {
      if (!line) continue;
      this.#fileLines++;
      let parsed: VillageEvent | undefined;
      try { parsed = parseVillageEvent(JSON.parse(line)); }
      catch { parsed = undefined; } // A torn final line after a crash is skipped.
      if (!parsed) { this.rejected++; continue; }
      fileEvents.push(parsed);
      if (parsed.seq <= this.#foldedSeq || parsed.seq <= (this.#ring.at(-1)?.seq ?? 0)) continue;
      this.#ring.push(parsed);
      this.#seq = Math.max(this.#seq, parsed.seq);
    }
    // Events are written before their keys, and lines whose keys were not yet indexed are kept in
    // the file even after folding: an interrupted or failed index write is repaired here.
    const indexed = this.#index.has(fileEvents.map((event) => event.key));
    for (const event of fileEvents) {
      if (indexed.has(event.key) || this.#unindexedKeys.has(event.key)) continue;
      this.#unindexed.push(event);
      this.#unindexedKeys.add(event.key);
    }
    this.#flushIndex();
    this.#state = reduceAll(this.#ring, this.#base);
    this.#evict();
    this.#compact();
  }

  get seq(): number { return this.#seq; }
  get state(): BoardState { return this.#state; }
  get size(): number { return this.#ring.length; }
  /** Highest sequence no longer replayable. */
  get foldedSeq(): number { return this.#foldedSeq; }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  append(input: unknown): VillageEvent | undefined {
    return this.appendMany([input])[0];
  }

  get closed(): boolean { return this.#closed; }

  /**
   * Validates, deduplicates by exact key (durable index) and persists a batch with one write,
   * then notifies subscribers. Throws when the journal is closed or the write fails; nothing
   * is acknowledged in that case.
   */
  appendMany(inputs: readonly unknown[]): VillageEvent[] {
    if (this.#closed) throw new JournalClosedError();
    const receivedAt = this.#now();
    const candidates: EventInput[] = [];
    const batchKeys = new Set<string>();
    for (const input of inputs) {
      const parsed = eventInputSchema.safeParse(input);
      if (!parsed.success) { this.rejected++; continue; }
      const occurred = Date.parse(parsed.data.occurredAt);
      if (occurred > receivedAt.getTime() + FUTURE_TOLERANCE_MS) { this.rejected++; continue; }
      if (batchKeys.has(parsed.data.key)) continue;
      batchKeys.add(parsed.data.key);
      candidates.push({ ...parsed.data, occurredAt: new Date(occurred).toISOString() });
    }
    if (candidates.length === 0) return [];
    // Fail closed rather than grow without bound while the durable index cannot be written.
    if (this.#unindexed.length >= MAX_UNINDEXED && !this.#flushIndex()) throw new Error('journal_key_index_unavailable');
    const known = this.#index.has(candidates.map((candidate) => candidate.key));
    let state = this.#state;
    let seq = this.#seq;
    const accepted: VillageEvent[] = [];
    for (const candidate of candidates) {
      if (known.has(candidate.key) || this.#unindexedKeys.has(candidate.key)) continue;
      const event = { ...candidate, seq: ++seq, receivedAt: receivedAt.toISOString() } as VillageEvent;
      // A distinct fact may leave the projection unchanged (older than the current entity); it is kept.
      state = reduce(state, event);
      accepted.push(event);
    }
    if (accepted.length === 0) return [];
    this.#write(accepted.map((event) => `${JSON.stringify(event)}\n`).join(''));
    this.#state = state;
    this.#seq = seq;
    for (const event of accepted) { this.#ring.push(event); this.#unindexed.push(event); this.#unindexedKeys.add(event.key); }
    this.#flushIndex();
    this.#fileLines += accepted.length;
    this.#evict();
    if (this.#fileLines > this.#retainedLines() + Math.max(100, Math.ceil(this.#capacity / 4))) this.#compact();
    for (const event of accepted) {
      for (const listener of [...this.#listeners]) {
        try { listener(event); } catch { /* A failing subscriber never blocks ingestion. */ }
      }
    }
    return accepted;
  }

  /**
   * Events after `after`, or a reset when they are not all replayable: a sequence from the
   * future (journal recreated), or a gap with folded events. `after = 0` is valid while nothing
   * has been folded.
   */
  since(after: number): Replay {
    if (!Number.isInteger(after) || after < 0 || after > this.#seq || after < this.#foldedSeq) return { kind: 'reset' };
    return { kind: 'events', events: this.#ring.filter((event) => event.seq > after) };
  }

  /** Age-based eviction for quiet periods. */
  prune(): void {
    if (this.#closed) return;
    const before = this.#foldedSeq;
    this.#evict();
    if (this.#foldedSeq !== before) this.#compact();
  }

  /** Final: a closed journal never reopens its files; later appends throw `JournalClosedError`. */
  close(): void {
    this.#closed = true;
    if (this.#fd !== undefined) closeSync(this.#fd);
    this.#fd = undefined;
    this.#listeners.clear();
  }

  #evict(): void {
    const cutoff = this.#now().getTime() - this.#maxAgeMs;
    while (this.#ring.length > 0 && (this.#ring.length > this.#capacity || Date.parse(this.#ring[0]!.receivedAt) < cutoff)) {
      const event = this.#ring.shift()!;
      this.#base = reduce(this.#base, event);
      this.#foldedSeq = event.seq;
    }
  }

  /**
   * Records pending keys in the durable index. On failure the events stay pending: their lines
   * remain in `events.jsonl` across compaction, so a restart re-indexes them.
   */
  #flushIndex(): boolean {
    if (this.#unindexed.length === 0) return true;
    try {
      this.#index.add(this.#unindexed.map((event) => event.key));
      this.#unindexed = [];
      this.#unindexedKeys.clear();
      this.indexError = undefined;
      return true;
    } catch {
      this.indexError = 'Index d’idempotence du journal indisponible : les événements concernés restent dans le journal jusqu’à sa réparation.';
      return false;
    }
  }

  /** Lines a compaction keeps: folded events whose keys are not yet indexed, then the ring. */
  #retainedLines(): number {
    const ringStart = this.#ring[0]?.seq ?? Number.POSITIVE_INFINITY;
    return this.#unindexed.filter((event) => event.seq < ringStart).length + this.#ring.length;
  }

  #write(text: string): void {
    if (this.#closed) throw new JournalClosedError();
    if (this.#fd === undefined) {
      this.#fd = openSync(this.#eventsPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      const stat = fstatSync(this.#fd);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('Event journal must be a private regular file (0600)');
    }
    writeSync(this.#fd, text);
  }

  #writeCheckpoint(epoch = this.epoch): void {
    writeAtomic(this.#checkpointPath, JSON.stringify({ version: 1, epoch, foldedSeq: this.#foldedSeq, lastSeq: this.#seq, state: this.#base }));
  }

  /** Checkpoint first, then the ring: a crash in between only leaves already-folded lines, skipped on load. */
  #compact(): void {
    this.#writeCheckpoint();
    if (this.#fd !== undefined) { closeSync(this.#fd); this.#fd = undefined; }
    const ringStart = this.#ring[0]?.seq ?? Number.POSITIVE_INFINITY;
    const retained = [...this.#unindexed.filter((event) => event.seq < ringStart), ...this.#ring];
    writeAtomic(this.#eventsPath, retained.map((event) => `${JSON.stringify(event)}\n`).join(''));
    this.#fileLines = retained.length;
  }
}

export type { EventInput };

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, ftruncateSync, openSync, readSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePrivateDirectory } from '../auth/privateState.js';

const RECORD_BYTES = 16;
const SHARDS = 256;
const CHUNK_BYTES = 64 * 1024;

function hashKey(key: string): Buffer {
  return createHash('sha256').update(key).digest().subarray(0, RECORD_BYTES);
}

/**
 * Durable, exact idempotence index for journal keys.
 *
 * Each accepted key is stored as a 128-bit SHA-256 prefix in one of 256 private append-only
 * shard files (0700 directory, 0600 files, `O_NOFOLLOW`). Lookups scan only the key's shard in
 * fixed 64 KiB chunks, so memory stays bounded whatever the journal's age; a bounded LRU keeps
 * recent keys in memory. No key text is stored, only hashes.
 */
export class KeyIndex {
  readonly directory: string;
  readonly #cache = new Map<string, true>();
  readonly #cacheSize: number;

  constructor(directory: string, options: { cacheSize?: number } = {}) {
    this.directory = ensurePrivateDirectory(directory);
    this.#cacheSize = Math.max(16, options.cacheSize ?? 20_000);
  }

  /** Keys of `keys` already recorded (exact match on the stored hash). */
  has(keys: readonly string[]): Set<string> {
    const found = new Set<string>();
    const wanted = new Map<number, Map<string, string[]>>();
    for (const key of keys) {
      const hash = hashKey(key);
      const hex = hash.toString('hex');
      if (this.#cache.has(hex)) { this.#touch(hex); found.add(key); continue; }
      const shard = hash[0]!;
      const entries = wanted.get(shard) ?? new Map<string, string[]>();
      entries.set(hex, [...(entries.get(hex) ?? []), key]);
      wanted.set(shard, entries);
    }
    for (const [shard, entries] of wanted) {
      for (const hex of this.#scan(shard, new Set(entries.keys()))) {
        this.#touch(hex);
        for (const key of entries.get(hex) ?? []) found.add(key);
      }
    }
    return found;
  }

  /** Records keys durably. Callers check `has` first; a repeated record is harmless. */
  add(keys: readonly string[]): void {
    const byShard = new Map<number, Buffer[]>();
    for (const key of keys) {
      const hash = hashKey(key);
      this.#touch(hash.toString('hex'));
      byShard.set(hash[0]!, [...(byShard.get(hash[0]!) ?? []), hash]);
    }
    for (const [shard, hashes] of byShard) {
      const fd = this.#open(shard, true)!;
      try {
        // A torn record from an interrupted write would misalign every later record.
        const size = fstatSync(fd).size;
        if (size % RECORD_BYTES !== 0) ftruncateSync(fd, size - (size % RECORD_BYTES));
        writeSync(fd, Buffer.concat(hashes));
      } finally { closeSync(fd); }
    }
  }

  #path(shard: number): string { return join(this.directory, `${shard.toString(16).padStart(2, '0')}.keys`); }

  #open(shard: number, write: boolean): number | undefined {
    let fd: number;
    try {
      fd = write
        ? openSync(this.#path(shard), constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
        : openSync(this.#path(shard), constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (!write && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
      closeSync(fd);
      throw new Error('Journal key index files must be private regular files (0600)');
    }
    return fd;
  }

  /** Streams one shard in fixed chunks and returns the wanted hashes it contains. */
  #scan(shard: number, wanted: Set<string>): Set<string> {
    const found = new Set<string>();
    const fd = this.#open(shard, false);
    if (fd === undefined) return found;
    try {
      const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
      let carry = Buffer.alloc(0);
      for (;;) {
        const read = readSync(fd, buffer, 0, CHUNK_BYTES, null);
        if (read === 0) break;
        const data = carry.length ? Buffer.concat([carry, buffer.subarray(0, read)]) : buffer.subarray(0, read);
        const whole = data.length - (data.length % RECORD_BYTES);
        for (let offset = 0; offset < whole; offset += RECORD_BYTES) {
          const hex = data.toString('hex', offset, offset + RECORD_BYTES);
          if (wanted.has(hex)) { found.add(hex); if (found.size === wanted.size) return found; }
        }
        carry = Buffer.from(data.subarray(whole));
      }
    } finally { closeSync(fd); }
    return found;
  }

  #touch(hex: string): void {
    this.#cache.delete(hex);
    this.#cache.set(hex, true);
    if (this.#cache.size > this.#cacheSize) this.#cache.delete(this.#cache.keys().next().value!);
  }
}

export { SHARDS as KEY_INDEX_SHARDS };

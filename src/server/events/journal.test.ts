import { appendFileSync, chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventJournal, JournalClosedError, RING_CAPACITY } from './journal.js';
import { LIMITS } from '../../shared/projector.js';
import { ci, observed, signal } from '../../shared/testEvents.js';

const directories: string[] = [];
const journals: EventJournal[] = [];
afterEach(() => {
  for (const journal of journals.splice(0)) journal.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup(options: { capacity?: number; maxAgeMs?: number; clock?: { now: number } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agent-village-journal-test-'));
  directories.push(root);
  const directory = join(root, 'journal');
  const clock = options.clock ?? { now: Date.parse('2026-10-01T12:00:00.000Z') };
  const open = () => {
    const journal = new EventJournal({ directory, capacity: options.capacity, maxAgeMs: options.maxAgeMs, now: () => new Date(clock.now) });
    journals.push(journal);
    return journal;
  };
  return { directory, clock, open };
}

describe('event journal', () => {
  it('defaults to a ring of at least 5 000 events', () => {
    expect(RING_CAPACITY).toBeGreaterThanOrEqual(5_000);
  });

  it('records an event received three times as one entry', () => {
    const { open, directory } = setup();
    const journal = open();
    const event = signal('claude:dup', '2026-10-01T11:59:00.000Z');
    const results = [journal.append(event), journal.append(event), journal.append({ ...event })];
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(journal.seq).toBe(1);
    expect(readFileSync(join(directory, 'events.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('persists privately (0700 directory, 0600 files) and rejects unsafe journal files', () => {
    const { open, directory } = setup();
    const journal = open();
    journal.append(signal('claude:mode', '2026-10-01T11:59:00.000Z'));
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(directory, 'events.jsonl')).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, 'checkpoint.json')).mode & 0o777).toBe(0o600);
    journal.close();
    chmodSync(join(directory, 'events.jsonl'), 0o644);
    expect(() => open()).toThrow('private regular files');
  });

  it('refuses a journal directory inside the source repository', () => {
    expect(() => new EventJournal({ directory: resolve('journal-inside-checkout') })).toThrow('outside the source repository');
  });

  it('reloads after restart with the same projection and a monotone sequence, recreating nothing', () => {
    const { open } = setup();
    const first = open();
    const inputs = [observed('codex:r', 'project-aaaaaaaaaaaa', '2026-10-01T11:00:00.000Z'), signal('claude:r', '2026-10-01T11:01:00.000Z'), ci('fictional/orchard', 'abc1234', '2026-10-01T11:02:00Z', 'success')];
    expect(first.appendMany(inputs)).toHaveLength(3);
    const before = first.state;
    first.close();
    const second = open();
    expect(second.seq).toBe(3);
    expect(second.state).toEqual(before);
    expect(second.appendMany(inputs)).toEqual([]);
    expect(second.append(signal('claude:r', '2026-10-01T11:03:00.000Z', 'waiting'))?.seq).toBe(4);
  });

  it('keeps a distinct delayed older fact in the journal without overwriting the newer entity', () => {
    const { open, directory } = setup();
    const journal = open();
    journal.append(ci('fictional/orchard', 'abc1234', '2026-10-01T11:05:00Z', 'success'));
    expect(journal.append(ci('fictional/orchard', 'abc1234', '2026-10-01T11:00:00Z', 'pending'))?.seq).toBe(2);
    expect(journal.state.facts['ci:fictional/orchard:abc1234']!.data).toMatchObject({ status: 'success' });
    expect(readFileSync(join(directory, 'events.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
    // The same delayed fact again is a duplicate.
    expect(journal.append(ci('fictional/orchard', 'abc1234', '2026-10-01T11:00:00Z', 'pending'))).toBeUndefined();
    expect(journal.seq).toBe(2);
  });

  it('keeps exact idempotence after ring eviction, projection eviction and restart, with bounded memory', () => {
    const { open, directory } = setup({ capacity: 2 });
    const journal = open();
    const inputs = Array.from({ length: LIMITS.sessions + 2 }, (_, index) => observed(`codex:kept-${String(index).padStart(5, '0')}`, 'project-retention',
      new Date(Date.parse('2026-10-01T10:00:00.000Z') + index * 1_000).toISOString()));
    expect(journal.appendMany(inputs)).toHaveLength(inputs.length);
    expect(journal.size).toBe(2);
    expect(Object.keys(journal.state.sessions)).toHaveLength(LIMITS.sessions);
    expect(journal.state.sessions['codex:kept-00000']).toBeUndefined(); // Evicted from the bounded projection.
    expect(journal.append(inputs[0])).toBeUndefined();
    journal.close();
    const reopened = open();
    expect(reopened.append(inputs[0])).toBeUndefined();
    expect(reopened.appendMany(inputs)).toEqual([]);
    expect(reopened.seq).toBe(inputs.length);
    // Keys are stored as hashes in private shard files, never as text.
    const shards = readdirSync(join(directory, 'keys'));
    expect(shards.length).toBeGreaterThan(0);
    expect(statSync(join(directory, 'keys')).mode & 0o777).toBe(0o700);
    for (const shard of shards) expect(statSync(join(directory, 'keys', shard)).mode & 0o777).toBe(0o600);
    expect(shards.map((shard) => readFileSync(join(directory, 'keys', shard), 'latin1')).join('')).not.toContain('codex:kept');
  });

  it('keeps unindexed lines through compaction when the key index cannot be written, then repairs on restart', () => {
    const { open, directory } = setup({ capacity: 2 });
    const journal = open();
    chmodSync(join(directory, 'keys'), 0o500);
    const inputs = Array.from({ length: 150 }, (_, index) => observed(`codex:fault-${index}`, 'project-fault', '2026-10-01T11:00:00.000Z'));
    try {
      expect(journal.appendMany(inputs)).toHaveLength(150);
      expect(journal.indexError).toMatch(/Index/);
      expect(journal.append(inputs[3])).toBeUndefined(); // Still deduplicated in memory.
      expect(readFileSync(join(directory, 'events.jsonl'), 'utf8').trim().split('\n')).toHaveLength(150);
    } finally { chmodSync(join(directory, 'keys'), 0o700); }
    journal.close();
    const reopened = open();
    expect(reopened.indexError).toBeUndefined();
    expect(reopened.append(inputs[0])).toBeUndefined();
    expect(readFileSync(join(directory, 'events.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('never reopens a closed journal', () => {
    const { open, directory } = setup();
    const journal = open();
    journal.append(signal('claude:c', '2026-10-01T11:59:00.000Z'));
    journal.close();
    rmSync(directory, { recursive: true, force: true });
    expect(() => journal.append(signal('claude:c', '2026-10-01T11:59:30.000Z', 'waiting'))).toThrow(JournalClosedError);
    journal.prune();
    expect(existsSync(directory)).toBe(false);
  });

  it('rejects unbounded, unknown or future-dated input instead of persisting it', () => {
    const { open, directory } = setup();
    const journal = open();
    const event = signal('claude:x', '2026-10-01T11:59:00.000Z');
    expect(journal.append({ ...event, data: { ...event.data, prompt: 'private prompt content' } })).toBeUndefined();
    expect(journal.append({ ...event, key: 'k'.repeat(500) })).toBeUndefined();
    expect(journal.append({ ...event, key: 'future', occurredAt: '2026-10-01T13:00:00.000Z' })).toBeUndefined();
    expect(journal.append({ ...event, key: 'top-level-extra', transcript: 'private transcript' })).toBeUndefined();
    expect(journal.append({ ...event, key: 'credential-link', kind: 'github.commit', source: 'github', sessionId: undefined,
      data: { repo: 'fictional/orchard', branch: 'main', sha: 'abc1234', message: 'Fictional', url: 'https://user:secret@example.test/c' } })).toBeUndefined();
    expect(journal.rejected).toBe(5);
    expect(journal.seq).toBe(0);
    expect(readFileSync(join(directory, 'events.jsonl'), 'utf8')).not.toContain('private prompt content');
  });

  it('bounds memory to the ring while folding evicted events into the projection', () => {
    const { open } = setup({ capacity: 5 });
    const journal = open();
    for (let index = 0; index < 12; index++) journal.append(signal(`claude:s${index}`, `2026-10-01T11:${String(index).padStart(2, '0')}:00.000Z`));
    expect(journal.size).toBe(5);
    expect(journal.foldedSeq).toBe(7);
    expect(Object.keys(journal.state.sessions)).toHaveLength(12);
    expect(journal.since(7)).toMatchObject({ kind: 'events', events: expect.arrayContaining([expect.objectContaining({ seq: 8 })]) });
    expect(journal.since(7).kind === 'events' && journal.since(7)).toMatchObject({ events: { length: 5 } });
    expect(journal.since(12)).toEqual({ kind: 'events', events: [] });
    expect(journal.since(6)).toEqual({ kind: 'reset' });
    expect(journal.since(0)).toEqual({ kind: 'reset' });
    expect(journal.since(13)).toEqual({ kind: 'reset' });
    journal.close();
    const reopened = open();
    expect(reopened.seq).toBe(12);
    expect(reopened.size).toBe(5);
    expect(Object.keys(reopened.state.sessions)).toHaveLength(12);
  });

  it('replays from zero while nothing has been folded', () => {
    const { open } = setup();
    const journal = open();
    expect(journal.since(0)).toEqual({ kind: 'events', events: [] });
    journal.append(signal('claude:z', '2026-10-01T11:59:00.000Z'));
    expect(journal.since(0)).toMatchObject({ kind: 'events', events: [{ seq: 1 }] });
  });

  it('evicts by age after 24 hours but keeps the projection and the sequence', () => {
    const clock = { now: Date.parse('2026-10-01T12:00:00.000Z') };
    const { open } = setup({ clock });
    const journal = open();
    journal.append(signal('claude:old', '2026-10-01T11:59:00.000Z'));
    clock.now += 25 * 60 * 60_000;
    journal.prune();
    expect(journal.size).toBe(0);
    expect(journal.since(0)).toEqual({ kind: 'reset' });
    expect(journal.since(1)).toEqual({ kind: 'events', events: [] });
    journal.close();
    const reopened = open();
    expect(reopened.seq).toBe(1);
    expect(reopened.state.sessions['claude:old']).toBeDefined();
    expect(reopened.append(signal('claude:new', '2026-10-02T12:59:00.000Z'))?.seq).toBe(2);
  });

  it('skips a torn final line after a crash', () => {
    const { open, directory } = setup();
    const journal = open();
    journal.append(signal('claude:t', '2026-10-01T11:59:00.000Z'));
    journal.close();
    appendFileSync(join(directory, 'events.jsonl'), '{"seq":2,"key":"torn');
    const reopened = open();
    expect(reopened.seq).toBe(1);
    expect(reopened.rejected).toBe(1);
    expect(reopened.append(signal('claude:t', '2026-10-01T11:59:30.000Z', 'waiting'))?.seq).toBe(2);
  });

  it('fails closed on a corrupt checkpoint', () => {
    const { open, directory } = setup();
    open().close();
    writeFileSync(join(directory, 'checkpoint.json'), '{"version":2}', { mode: 0o600 });
    expect(() => open()).toThrow();
  });

  it('notifies subscribers synchronously after persistence and isolates subscriber failures', () => {
    const { open } = setup();
    const journal = open();
    const seen: number[] = [];
    journal.subscribe(() => { throw new Error('subscriber failure'); });
    journal.subscribe((event) => seen.push(event.seq));
    journal.append(signal('claude:n', '2026-10-01T11:59:00.000Z'));
    expect(seen).toEqual([1]);
  });
});

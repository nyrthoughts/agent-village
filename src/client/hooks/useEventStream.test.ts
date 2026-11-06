import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardSnapshot } from '../../shared/board.js';
import { emptyState } from '../../shared/projector.js';
import { sequence, signal } from '../../shared/testEvents.js';
import { parseSse } from '../api/sse.js';
import { clearSession, getSession, setSession } from '../api/session.js';
import { createBoardFeed, type FeedState } from './useEventStream.js';

afterEach(() => clearSession());

const snapshot = (seq = 0, epoch = 'epoch-a'): BoardSnapshot => ({ epoch, seq, state: { ...emptyState(), seq }, plans: {}, health: [], mode: 'native', fictional: false,
  generatedAt: '2026-10-01T12:00:00.000Z', capabilities: { stream: true, editPlans: true, mapProjects: true }, errors: [] });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const events = sequence([signal('claude:a', '2026-10-01T11:00:00.000Z'), signal('claude:b', '2026-10-01T11:01:00.000Z'), signal('claude:c', '2026-10-01T11:02:00.000Z')]);
const frame = (event: (typeof events)[number]) => `id: ${event.seq}\nevent: village\ndata: ${JSON.stringify(event)}\n\n`;

function controllable() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  return { body, push: (text: string) => controller.enqueue(new TextEncoder().encode(text)), close: () => controller.close(), fail: () => controller.error(new Error('network')) };
}

/** Timers fired by hand, to order polls, reconnections and responses deterministically. */
function manualTimers() {
  let next = 1;
  const queue = new Map<number, { callback: () => void; ms: number }>();
  return {
    setTimeout: (callback: () => void, ms: number) => { const id = next++; queue.set(id, { callback, ms }); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => { queue.delete(handle as unknown as number); },
    active: () => queue.size,
    /** Fires the oldest queued timer with this delay. */
    fire: (ms: number) => {
      const entry = [...queue.entries()].find(([, timer]) => timer.ms === ms);
      if (!entry) throw new Error(`no timer of ${ms} ms`);
      queue.delete(entry[0]);
      entry[1].callback();
    },
  };
}

function harness(board: () => Response | Promise<Response>, streams: Array<() => Response>) {
  const urls: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url === '/api/board') return board();
    if (url.startsWith('/api/stream')) {
      expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer /);
      const next = streams.shift();
      return next ? next() : new Response(null, { status: 503 });
    }
    throw new Error(`unexpected ${url}`);
  });
  const states: FeedState[] = [];
  const feed = createBoardFeed({ fetchImpl, onChange: (state) => states.push(state), pollMs: 20, maxBackoffMs: 40, random: () => 0, watchdogMs: 5_000 });
  return { feed, urls, states, latest: () => states.at(-1)! };
}

describe('SSE parsing', () => {
  it('parses complete frames, keeps partial input and ignores comments', () => {
    const result = parseSse(': comment\n\nid: 4\nevent: village\ndata: {"a":1}\n\nevent: heart');
    expect(result.frames).toEqual([{ event: 'village', id: '4', data: '{"a":1}' }]);
    expect(result.rest).toBe('event: heart');
    expect(parseSse('data: one\ndata: two\r\n\r\n').frames).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });
});

describe('board feed', () => {
  it('applies streamed events once, in sequence, and context updates', async () => {
    setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const stream = controllable();
    const test = harness(() => json(snapshot()), [() => new Response(stream.body, { status: 200 })]);
    test.feed.start();
    await vi.waitFor(() => expect(test.latest().status).toBe('live'));
    expect(test.urls[1]).toBe('/api/stream?after=0&epoch=epoch-a');
    stream.push(frame(events[0]!) + frame(events[0]!) + frame(events[1]!));
    stream.push(`event: context\ndata: ${JSON.stringify({ plans: {}, health: [{ id: 'codex', label: 'Codex', kind: 'poll', lastOkAt: '2026-10-01T11:00:00.000Z' }], errors: [] })}\n\n`);
    await vi.waitFor(() => expect(test.latest().snapshot!.health).toHaveLength(1));
    expect(test.latest().snapshot!.seq).toBe(2);
    expect(Object.keys(test.latest().snapshot!.state.sessions)).toEqual(['claude:a', 'claude:b']);
    expect(test.latest().received.map((entry) => entry.seq)).toEqual([1, 2]);
    test.feed.stop();
  });

  it('resumes from the last applied sequence after a gap or a heartbeat ahead of it, and accepts a reset', async () => {
    setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const first = controllable();
    const second = controllable();
    const third = controllable();
    const test = harness(() => json(snapshot()), [() => new Response(first.body), () => new Response(second.body), () => new Response(third.body)]);
    test.feed.start();
    await vi.waitFor(() => expect(test.latest().status).toBe('live'));
    first.push(frame(events[0]!) + frame(events[2]!)); // Event 2 is missing.
    await vi.waitFor(() => expect(test.urls.filter((url) => url.startsWith('/api/stream'))).toHaveLength(2));
    expect(test.urls.at(-1)).toBe('/api/stream?after=1&epoch=epoch-a');
    second.push('event: heartbeat\ndata: {"seq":3,"at":"2026-10-01T12:00:00.000Z"}\n\n');
    await vi.waitFor(() => expect(test.urls.filter((url) => url.startsWith('/api/stream'))).toHaveLength(3));
    expect(test.urls.at(-1)).toBe('/api/stream?after=1&epoch=epoch-a');
    third.push(`id: 9\nevent: reset\ndata: ${JSON.stringify(snapshot(9, 'epoch-b'))}\n\n`);
    await vi.waitFor(() => expect(test.latest().snapshot).toMatchObject({ seq: 9, epoch: 'epoch-b' }));
    test.feed.stop();
  });

  it('falls back to 5-second-style polling while reconnecting with backoff, then returns to the stream', async () => {
    setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const broken = controllable();
    const healthy = controllable();
    let boardSeq = 0;
    const test = harness(() => json(snapshot(boardSeq)), [() => new Response(broken.body), () => new Response(null, { status: 502 }), () => new Response(healthy.body)]);
    test.feed.start();
    await vi.waitFor(() => expect(test.latest().status).toBe('live'));
    boardSeq = 3;
    broken.fail();
    await vi.waitFor(() => expect(test.states.some((state) => state.status === 'reconnecting')).toBe(true));
    await vi.waitFor(() => expect(test.urls.filter((url) => url === '/api/board').length).toBeGreaterThan(1));
    await vi.waitFor(() => expect(test.latest().status).toBe('live'), { timeout: 2_000 });
    expect(test.urls.at(-1)).toBe('/api/stream?after=3&epoch=epoch-a');
    test.feed.stop();
  });

  it('ignores a late 401 from a stopped feed: a newly rotated session stays signed in', async () => {
    setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    let release!: (response: Response) => void;
    let calls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      calls++;
      if (calls === 1) return json({ ...snapshot(), capabilities: { stream: false, editPlans: false, mapProjects: false } });
      return new Promise<Response>((done) => { release = done; });
    });
    const feed = createBoardFeed({ fetchImpl, onChange: () => undefined, pollMs: 5 });
    feed.start();
    await vi.waitFor(() => expect(calls).toBe(2)); // A poll is in flight with the old bearer.
    feed.stop();
    setSession({ token: 'b'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    release(json({ error: 'unauthorized' }, 401));
    await new Promise((done) => setTimeout(done, 20));
    expect(getSession()?.token).toBe('b'.repeat(43));
  });

  it('serializes visibility-triggered polls and keeps a single timer', async () => {
    const timers = manualTimers();
    const listeners = new Set<() => void>();
    const visibility = { hidden: false, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
    const pending: ((response: Response) => void)[] = [];
    let boards = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      boards++;
      if (boards === 1) return json({ ...snapshot(), capabilities: { stream: false, editPlans: false, mapProjects: false } });
      return new Promise<Response>((done) => pending.push(done));
    });
    const feed = createBoardFeed({ fetchImpl, onChange: () => undefined, pollMs: 5_000, timers, visibility: visibility as never });
    feed.start();
    await vi.waitFor(() => expect(timers.active()).toBe(1));
    for (let index = 0; index < 3; index++) for (const listener of listeners) listener();
    await vi.waitFor(() => expect(boards).toBe(2));
    for (const listener of listeners) listener();
    expect(boards).toBe(2);
    expect(timers.active()).toBe(0);
    pending.shift()!(json({ ...snapshot(1), capabilities: { stream: false, editPlans: false, mapProjects: false } }));
    await vi.waitFor(() => expect(timers.active()).toBe(1));
    feed.stop();
  });

  it('discards a delayed poll of the old epoch that completes after a stream reset', async () => {
    setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const timers = manualTimers();
    const broken = controllable();
    const fresh = controllable();
    const streams = [() => new Response(broken.body), () => new Response(fresh.body)];
    let release!: (response: Response) => void;
    let boards = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).startsWith('/api/stream')) return streams.shift()!();
      boards++;
      return boards === 1 ? json(snapshot(3)) : new Promise<Response>((done) => { release = done; });
    });
    const states: FeedState[] = [];
    const feed = createBoardFeed({ fetchImpl, onChange: (state) => states.push(state), pollMs: 20, maxBackoffMs: 40, random: () => 0, timers, visibility: { hidden: false, addEventListener() {}, removeEventListener() {} } as never });
    feed.start();
    await vi.waitFor(() => expect(states.at(-1)?.status).toBe('live'));
    broken.fail();
    await vi.waitFor(() => expect(states.at(-1)?.status).toBe('reconnecting'));
    timers.fire(20); // Poll timer: the request starts and stays pending.
    await vi.waitFor(() => expect(boards).toBe(2));
    timers.fire(20); // Reconnect timer.
    await vi.waitFor(() => expect(states.at(-1)?.status).toBe('live'));
    fresh.push(`id: 2\nevent: reset\ndata: ${JSON.stringify(snapshot(2, 'epoch-b'))}\n\n`);
    await vi.waitFor(() => expect(states.at(-1)?.snapshot?.epoch).toBe('epoch-b'));
    release(json(snapshot(9, 'epoch-a')));
    await new Promise((done) => setTimeout(done, 20));
    expect(states.at(-1)?.snapshot).toMatchObject({ epoch: 'epoch-b', seq: 2 });
    feed.stop();
  });

  it('polls when the server has no stream, and locks on 401 or an expired frame', async () => {
    const polling = harness(() => json({ ...snapshot(), capabilities: { stream: false, editPlans: false, mapProjects: false } }), []);
    polling.feed.start();
    await vi.waitFor(() => expect(polling.latest().status).toBe('polling'));
    await vi.waitFor(() => expect(polling.urls.filter((url) => url === '/api/board').length).toBeGreaterThan(2));
    expect(polling.urls.some((url) => url.startsWith('/api/stream'))).toBe(false);
    polling.feed.stop();

    setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const unauthorized = harness(() => json(snapshot()), [() => json({ error: 'unauthorized' }, 401)]);
    unauthorized.feed.start();
    await vi.waitFor(() => expect(getSession()).toBeNull());

    setSession({ token: 'b'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const stream = controllable();
    const expired = harness(() => json(snapshot()), [() => new Response(stream.body)]);
    expired.feed.start();
    await vi.waitFor(() => expect(expired.latest().status).toBe('live'));
    stream.push('event: expired\ndata: {}\n\n');
    await vi.waitFor(() => expect(getSession()).toBeNull());
  });
});

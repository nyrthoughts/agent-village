import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BoardContext, BoardSnapshot } from '../../shared/board.js';
import { parseVillageEvent } from '../../shared/events.js';
import { reduce } from '../../shared/projector.js';
import { ApiError, fetchBoard } from '../api/client.js';
import { clearSession, getSession, sessionHeaders, subscribeSession } from '../api/session.js';
import { parseSse } from '../api/sse.js';

export type FeedStatus = 'connecting' | 'live' | 'reconnecting' | 'polling' | 'static' | 'offline';
export interface ReceivedEvent { seq: number; receivedAt: string }
export interface FeedState {
  snapshot?: BoardSnapshot;
  status: FeedStatus;
  error?: string;
  /** Client time of the last stream frame or successful poll. */
  lastSignalAt?: number;
  retryAt?: number;
  /** Recently applied streamed events, for render-latency measurement (bounded). */
  received: ReceivedEvent[];
}

interface Timers { setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>; clearTimeout(handle: ReturnType<typeof setTimeout>): void }
export interface FeedOptions {
  fetchImpl?: typeof fetch;
  onChange: (state: FeedState) => void;
  pollMs?: number;
  /** Reconnect when no frame (heartbeat included) arrives for this long. */
  watchdogMs?: number;
  maxBackoffMs?: number;
  timers?: Timers;
  random?: () => number;
  visibility?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
}

const RECEIVED_LIMIT = 500;

/**
 * Board feed: snapshot, then an authenticated fetch-based SSE stream with exact catch-up by
 * sequence, exponential reconnection, and 5-second polling while the stream is down or absent.
 */
export function createBoardFeed(options: FeedOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timers: Timers = options.timers ?? { setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: (handle) => clearTimeout(handle) };
  const pollMs = options.pollMs ?? 5_000;
  const watchdogMs = options.watchdogMs ?? 45_000;
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;
  const random = options.random ?? Math.random;
  const visibility = options.visibility ?? (typeof document === 'undefined' ? undefined : document);
  let state: FeedState = { status: 'connecting', received: [] };
  let stopped = false;
  let attempt = 0;
  let controller: AbortController | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let polling = false;
  let streaming = false;
  /** One poll at a time; visibility changes and timers share it. */
  let inFlight: Promise<void> | undefined;
  /** Incremented whenever the stream replaces the snapshot (reset): older poll responses are discarded. */
  let generation = 0;

  const emit = (patch: Partial<FeedState>) => { state = { ...state, ...patch }; if (!stopped) options.onChange(state); };
  /**
   * 401 from this feed's own request. The request already cleared the session only if it still
   * holds the token that was sent, so a late 401 from a stopped feed never clears a rotated session.
   */
  const fail = (error: unknown) => {
    if (!(error instanceof ApiError) || error.status !== 401) return false;
    if (!stopped) stop();
    return true;
  };

  function poll(): Promise<void> {
    if (pollTimer) timers.clearTimeout(pollTimer);
    pollTimer = undefined;
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = (async () => {
      if (visibility?.hidden) return;
      const startedGeneration = generation;
      try {
        const next = await fetchBoard(fetchImpl);
        if (stopped || startedGeneration !== generation) return; // A newer reset already applied.
        const current = state.snapshot;
        if (!current || next.epoch !== current.epoch || next.seq >= current.seq) emit({ snapshot: next, lastSignalAt: Date.now(), error: undefined });
      } catch (error) {
        if (stopped || fail(error)) return;
        emit({ error: error instanceof Error ? error.message : String(error) });
      }
    })().finally(() => {
      inFlight = undefined;
      if (polling && !stopped && !pollTimer) pollTimer = timers.setTimeout(() => void poll(), pollMs);
    });
    return inFlight;
  }
  function startPolling(status: FeedStatus): void {
    emit({ status });
    if (polling) return;
    polling = true;
    if (!pollTimer && !inFlight) pollTimer = timers.setTimeout(() => void poll(), pollMs);
  }
  function stopPolling(): void {
    polling = false;
    if (pollTimer) timers.clearTimeout(pollTimer);
    pollTimer = undefined;
  }

  function scheduleReconnect(immediate = false): void {
    if (stopped) return;
    streaming = false;
    controller?.abort();
    if (watchdog) timers.clearTimeout(watchdog);
    const delay = immediate ? 0 : Math.min(maxBackoffMs, 1_000 * 2 ** attempt) * (0.5 + random() * 0.5);
    attempt = immediate ? attempt : attempt + 1;
    if (!immediate) startPolling('reconnecting');
    if (retryTimer) timers.clearTimeout(retryTimer);
    emit({ retryAt: Date.now() + delay });
    retryTimer = timers.setTimeout(() => { retryTimer = undefined; void connect(); }, delay);
  }

  function armWatchdog(): void {
    if (watchdog) timers.clearTimeout(watchdog);
    watchdog = timers.setTimeout(() => scheduleReconnect(), watchdogMs);
  }

  function applyContext(context: BoardContext): void {
    if (state.snapshot) emit({ snapshot: { ...state.snapshot, ...context } });
  }

  async function connect(): Promise<void> {
    const snapshot = state.snapshot;
    if (stopped || !snapshot) return;
    const authorization = sessionHeaders('/api/stream');
    controller = new AbortController();
    const signal = controller.signal;
    let response: Response;
    try {
      response = await fetchImpl(`/api/stream?after=${snapshot.seq}&epoch=${encodeURIComponent(snapshot.epoch)}`, {
        headers: { accept: 'text/event-stream', ...authorization }, cache: 'no-store', credentials: 'omit', signal });
    } catch { if (!signal.aborted) scheduleReconnect(); return; }
    if (stopped || signal.aborted) return;
    if (response.status === 401) { stop(); if (authorization.authorization) clearSession(authorization.authorization.slice(7)); return; }
    if (!response.ok || !response.body) {
      if (response.status === 404) { startPolling('polling'); return; }
      scheduleReconnect(); return;
    }
    streaming = true;
    attempt = 0;
    stopPolling();
    emit({ status: 'live', error: undefined, retryAt: undefined, lastSignalAt: Date.now() });
    armWatchdog();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || stopped || signal.aborted) break;
        armWatchdog();
        const parsed = parseSse(buffer + decoder.decode(value, { stream: true }));
        buffer = parsed.rest;
        if (buffer.length > 4 * 1024 * 1024) throw new Error('Stream frame too large');
        let next = state.snapshot!;
        const received: ReceivedEvent[] = [];
        let action: 'none' | 'resume' | 'expired' = 'none';
        let reset = false;
        for (const frame of parsed.frames) {
          if (frame.event === 'village') {
            const event = parseVillageEvent(JSON.parse(frame.data));
            if (!event || event.seq <= next.seq) continue;
            if (event.seq !== next.seq + 1) { action = 'resume'; break; } // Gap: resume from the last applied sequence.
            next = { ...next, seq: event.seq, state: reduce(next.state, event) };
            received.push({ seq: event.seq, receivedAt: event.receivedAt });
          } else if (frame.event === 'reset') {
            next = JSON.parse(frame.data) as BoardSnapshot;
            reset = true;
          } else if (frame.event === 'context') {
            next = { ...next, ...(JSON.parse(frame.data) as BoardContext) };
          } else if (frame.event === 'heartbeat') {
            const beat = JSON.parse(frame.data) as { seq?: number };
            if (typeof beat.seq === 'number' && beat.seq > next.seq) { action = 'resume'; break; }
          } else if (frame.event === 'expired') { action = 'expired'; break; }
        }
        if (stopped || signal.aborted) break;
        if (reset) generation++;
        emit({ snapshot: next, lastSignalAt: Date.now(), ...(received.length ? { received: [...state.received, ...received].slice(-RECEIVED_LIMIT) } : {}) });
        if (action === 'expired') { stop(); if (authorization.authorization) clearSession(authorization.authorization.slice(7)); return; }
        if (action === 'resume') { scheduleReconnect(true); return; }
      }
    } catch { /* Network failure or malformed frame: reconnect below. */ }
    finally { reader.releaseLock?.(); }
    if (!stopped && !signal.aborted) scheduleReconnect();
  }

  async function start(): Promise<void> {
    try {
      const snapshot = await fetchBoard(fetchImpl);
      if (stopped) return;
      generation++;
      emit({ snapshot, lastSignalAt: Date.now(), error: undefined });
      if (snapshot.capabilities.stream) void connect();
      else startPolling(snapshot.fictional && import.meta.env.BASE_URL !== '/' ? 'static' : 'polling');
    } catch (error) {
      if (stopped || fail(error)) return;
      emit({ status: 'offline', error: error instanceof Error ? error.message : String(error) });
      if (!stopped) retryTimer = timers.setTimeout(() => void start(), Math.min(maxBackoffMs, 1_000 * 2 ** attempt++));
    }
  }

  // Serialized with the timer: an in-flight poll is reused, never duplicated.
  const onVisibility = () => { if (!visibility?.hidden && polling && !streaming && !inFlight) void poll(); };
  function stop(): void {
    stopped = true;
    streaming = false;
    controller?.abort();
    stopPolling();
    for (const timer of [retryTimer, watchdog]) if (timer) timers.clearTimeout(timer);
    visibility?.removeEventListener('visibilitychange', onVisibility);
  }

  return {
    start: () => { visibility?.addEventListener('visibilitychange', onVisibility); void start(); },
    stop,
    state: () => state,
  };
}

export function useEventStream(fetchImpl: typeof fetch = fetch): FeedState {
  const session = useSyncExternalStore(subscribeSession, getSession);
  const [state, setState] = useState<FeedState>({ status: 'connecting', received: [] });
  const token = session?.token;
  useEffect(() => {
    // A new session (or its end) restarts the feed; a revoked bearer is never reused.
    const feed = createBoardFeed({ fetchImpl, onChange: setState });
    feed.start();
    return () => feed.stop();
  }, [fetchImpl, token]);
  return state;
}

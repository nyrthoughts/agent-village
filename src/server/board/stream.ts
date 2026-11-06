import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BoardContext, BoardSnapshot, StreamMessage } from '../../shared/board.js';
import type { Replay } from '../events/journal.js';

export interface StreamSource {
  readonly epoch: string;
  readonly seq: number;
  snapshot(): BoardSnapshot;
  context(): BoardContext;
  replay(after: number, epoch?: string): Replay;
  subscribe(listener: (message: StreamMessage) => void): () => void;
}

export interface StreamSession {
  expiresAt: number;
  isActive(): boolean;
  onRevoke(listener: () => void): () => void;
}

export const HEARTBEAT_MS = 15_000;
const MAX_BUFFERED_BYTES = 1024 * 1024;
let open = 0;
export const MAX_STREAMS = 8;
export function openStreams(): number { return open; }

/** `Last-Event-ID` wins over `after`; anything not a non-negative integer is treated as a reset request. */
export function resumePoint(request: IncomingMessage): number {
  const header = request.headers['last-event-id'];
  const query = new URL(request.url ?? '/', 'http://localhost').searchParams.get('after');
  const raw = typeof header === 'string' && header.length > 0 ? header : query ?? '0';
  return /^\d{1,15}$/.test(raw) ? Number(raw) : -1;
}

function frame(message: StreamMessage): string {
  switch (message.type) {
    case 'event': return `id: ${message.event.seq}\nevent: village\ndata: ${JSON.stringify(message.event)}\n\n`;
    case 'reset': return `id: ${message.snapshot.seq}\nevent: reset\ndata: ${JSON.stringify(message.snapshot)}\n\n`;
    case 'context': return `event: context\ndata: ${JSON.stringify(message.context)}\n\n`;
    case 'heartbeat': return `event: heartbeat\ndata: ${JSON.stringify({ seq: message.seq, at: message.at })}\n\n`;
    case 'expired': return 'event: expired\ndata: {}\n\n';
  }
}

/**
 * Server-sent events over an authenticated fetch. Replay and subscription happen in one
 * synchronous block, so no event can fall between them. The stream ends on logout, session
 * rotation or expiry, on client disconnect, and when a slow reader exceeds the buffer bound.
 */
export function serveStream(request: IncomingMessage, response: ServerResponse, source: StreamSource, session: StreamSession, options: { heartbeatMs?: number; now?: () => number } = {}): void {
  const now = options.now ?? Date.now;
  if (open >= MAX_STREAMS) {
    response.statusCode = 429;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end('{"error":"too_many_streams"}');
    return;
  }
  open++;
  const epoch = new URL(request.url ?? '/', 'http://localhost').searchParams.get('epoch') ?? undefined;
  const after = resumePoint(request);
  response.statusCode = 200;
  response.setHeader('content-type', 'text/event-stream; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-accel-buffering', 'no');
  response.setHeader('connection', 'keep-alive');
  request.socket.setKeepAlive(true);
  request.socket.setNoDelay(true);

  let closed = false;
  const cleanups: (() => void)[] = [];
  const close = (final?: StreamMessage) => {
    if (closed) return;
    closed = true;
    open--;
    for (const cleanup of cleanups.splice(0)) cleanup();
    if (final && !response.writableEnded) response.write(frame(final));
    response.end();
  };
  const send = (message: StreamMessage) => {
    if (closed) return;
    if (!session.isActive()) { close({ type: 'expired' }); return; }
    response.write(frame(message));
    // A reader that stops consuming is dropped; it reconnects and catches up by sequence.
    if (response.writableLength > MAX_BUFFERED_BYTES) close();
  };

  // Synchronous: replay what the client missed, then subscribe before any new append can run.
  const replay = after < 0 ? { kind: 'reset' as const } : source.replay(after, epoch);
  if (replay.kind === 'reset') response.write(frame({ type: 'reset', snapshot: source.snapshot() }));
  else {
    for (const event of replay.events) response.write(frame({ type: 'event', event }));
    response.write(frame({ type: 'context', context: source.context() }));
  }
  cleanups.push(source.subscribe(send));
  cleanups.push(session.onRevoke(() => close({ type: 'expired' })));
  const heartbeat = setInterval(() => send({ type: 'heartbeat', seq: source.seq, at: new Date(now()).toISOString() }), options.heartbeatMs ?? HEARTBEAT_MS);
  cleanups.push(() => clearInterval(heartbeat));
  const expiry = setTimeout(() => close({ type: 'expired' }), Math.max(0, session.expiresAt - now()));
  cleanups.push(() => clearTimeout(expiry));
  // ServerResponse 'close' fires when the connection drops (IncomingMessage 'close' fires once the body is read).
  response.once('close', () => close());
  response.once('error', () => close());
}

import { basename } from 'node:path';
import { z } from 'zod';
import type { Worker, WorkerState } from '../../shared/activity.js';
import { redactTitle } from './redact.js';

const sessionId = z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/);
/** Producer-generated delivery identity, reused on every retry of the same lifecycle event. */
const eventId = z.string().regex(/^[A-Za-z0-9._:-]{8,120}$/);
const producerTime = z.string().datetime({ offset: true }).max(40);
export const CLAUDE_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure',
  'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd'] as const;
const claudeEvent = z.object({
  session_id: sessionId,
  hook_event_name: z.enum(CLAUDE_HOOK_EVENTS),
  cwd: z.string().min(1).max(2_048),
  agent_id: sessionId.optional(),
  agent_type: z.string().min(1).max(120).optional(),
  // Identifier only, used solely inside a hashed idempotence key. Tool inputs/outputs are stripped.
  tool_use_id: sessionId.optional().catch(undefined),
  event_id: eventId.optional().catch(undefined),
  occurred_at: producerTime.optional().catch(undefined),
}); // Claude sends extra fields; Zod strips them rather than retaining prompt/tool contents.

/** Delivery metadata a producer may send outside the payload (bundled hook command headers). */
export interface HookDelivery { eventId?: string; occurredAt?: string }

/** Allowlisted, bounded hook metadata handed to the event journal. No raw payload field survives. */
export interface HookObservation {
  tool: 'claude' | 'openclaw';
  sessionId: string;
  parentId?: string;
  role: Worker['role'] & string;
  state: WorkerState;
  event: string;
  title?: string;
  hint?: string;
  /** Source-derived discriminator for the idempotence key (never persisted as such). */
  discriminator: string;
  /** Stable source identity of a tool call (Claude `tool_use_id`); hashed into the key only. */
  toolUseId?: string;
  /** Producer delivery identity; hashed into the key only. */
  eventId?: string;
  /** Producer time of the lifecycle event, when supplied and plausible. */
  occurredAt?: Date;
  /** Server receipt time. */
  at: Date;
}
const openClawEvent = z.object({
  sessionId,
  event: z.enum(['session_start', 'agent_start', 'agent_end', 'session_end']),
  title: z.string().max(240).optional(),
  cwd: z.string().max(2_048).optional(),
  eventId: eventId.optional().catch(undefined),
  occurredAt: producerTime.optional().catch(undefined),
});

const FUTURE_TOLERANCE_MS = 5 * 60_000;
/** A producer time is kept only when it parses and is not in the future beyond clock skew. */
function producerAt(value: string | undefined, receipt: Date): Date | undefined {
  if (!value) return undefined;
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= receipt.getTime() + FUTURE_TOLERANCE_MS ? new Date(at) : undefined;
}
function delivery(meta: HookDelivery | undefined, id: string | undefined, at: string | undefined, receipt: Date) {
  const stableId = id ?? (meta?.eventId && eventId.safeParse(meta.eventId).success ? meta.eventId : undefined);
  const time = producerAt(at ?? (meta?.occurredAt && producerTime.safeParse(meta.occurredAt).success ? meta.occurredAt : undefined), receipt);
  return { ...(stableId ? { eventId: stableId } : {}), ...(time ? { occurredAt: time } : {}) };
}

interface StoredWorker extends Worker { seenAt: number }

function claudeState(event: string): WorkerState {
  if (event === 'Stop' || event === 'Notification') return 'waiting';
  if (event === 'SessionEnd') return 'idle';
  return 'working';
}

function openClawState(event: string): WorkerState {
  if (event === 'agent_end') return 'waiting';
  if (event === 'session_end') return 'idle';
  return 'working';
}

export class HookActivityStore {
  readonly #records = new Map<string, StoredWorker>();

  readonly #observers = new Set<(observation: HookObservation) => void>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMinutes = 30,
    private readonly maxRecords = 1_000,
  ) {}

  /** Receives each accepted hook as allowlisted metadata; ingestion never triggers anything else. */
  observe(listener: (observation: HookObservation) => void): () => void {
    this.#observers.add(listener);
    return () => { this.#observers.delete(listener); };
  }

  private emit(observation: HookObservation): void {
    for (const listener of this.#observers) listener(observation);
  }

  private prune(): void {
    const cutoff = this.now().getTime() - this.ttlMinutes * 60_000;
    for (const [id, record] of this.#records) if (record.seenAt < cutoff) this.#records.delete(id);
  }

  private reserve(id: string): void {
    this.prune();
    if (this.#records.has(id) || this.#records.size < this.maxRecords) return;
    const oldest = [...this.#records.values()].reduce((a, b) => a.seenAt <= b.seenAt ? a : b);
    this.#records.delete(oldest.id);
  }

  ingestClaude(payload: unknown, meta?: HookDelivery): boolean {
    const parsed = claudeEvent.safeParse(payload);
    if (!parsed.success) return false;
    const current = this.now();
    const leadId = `claude:${parsed.data.session_id}`;
    const isHelperEvent = parsed.data.hook_event_name === 'SubagentStart'
      || parsed.data.hook_event_name === 'SubagentStop';
    if (isHelperEvent && !parsed.data.agent_id) return false;
    const helperId = `${leadId}:helper:${parsed.data.agent_id ?? ''}`;
    const event = parsed.data.hook_event_name;
    const hint = redactTitle(basename(parsed.data.cwd) || '').slice(0, 80) || undefined;
    this.emit({
      tool: 'claude', sessionId: isHelperEvent ? helperId : leadId, ...(isHelperEvent ? { parentId: leadId } : {}),
      role: isHelperEvent ? 'helper' : 'lead', state: event === 'SubagentStop' ? 'idle' : claudeState(event), event,
      ...(isHelperEvent && parsed.data.agent_type ? { title: redactTitle(parsed.data.agent_type).slice(0, 120) } : {}),
      ...(hint ? { hint } : {}),
      discriminator: [event, parsed.data.agent_id ?? '', parsed.data.tool_use_id ?? ''].join('|'),
      ...(parsed.data.tool_use_id ? { toolUseId: parsed.data.tool_use_id } : {}),
      ...delivery(meta, parsed.data.event_id, parsed.data.occurred_at, current), at: current,
    });
    if (parsed.data.hook_event_name === 'SubagentStop') {
      this.#records.delete(helperId);
      return true;
    }
    if (parsed.data.hook_event_name === 'SessionEnd') {
      for (const id of this.#records.keys()) {
        if (id.startsWith(`${leadId}:helper:`)) this.#records.delete(id);
      }
    }
    const id = parsed.data.hook_event_name === 'SubagentStart' ? helperId : leadId;
    const previous = this.#records.get(id);
    this.reserve(id);
    this.#records.set(id, {
      id,
      tool: 'claude',
      role: parsed.data.hook_event_name === 'SubagentStart' ? 'helper' : 'lead',
      ...(parsed.data.hook_event_name === 'SubagentStart' ? { parentId: leadId } : {}),
      state: claudeState(parsed.data.hook_event_name),
      project: redactTitle(basename(parsed.data.cwd) || 'unknown').slice(0, 80),
      title: redactTitle(
        parsed.data.hook_event_name === 'SubagentStart'
          ? parsed.data.agent_type ?? 'Claude helper'
          : basename(parsed.data.cwd) || 'Claude session',
      ).slice(0, 120),
      firstSeenAt: previous?.firstSeenAt ?? current.toISOString(),
      lastActivityAt: current.toISOString(),
      activityEvidence: { level: 'recent', source: 'claude-hook', observedAt: current.toISOString() },
      seenAt: current.getTime(),
    });
    return true;
  }

  ingestOpenClaw(payload: unknown, meta?: HookDelivery): boolean {
    const parsed = openClawEvent.safeParse(payload);
    if (!parsed.success) return false;
    const current = this.now();
    const id = `openclaw:${parsed.data.sessionId}`;
    this.reserve(id);
    const rawTitle = parsed.data.title?.trim()
      || (parsed.data.cwd ? basename(parsed.data.cwd) : '')
      || 'OpenClaw session';
    const hint = parsed.data.cwd ? redactTitle(basename(parsed.data.cwd)).slice(0, 80) || undefined : undefined;
    this.emit({ tool: 'openclaw', sessionId: id, role: 'unknown', state: openClawState(parsed.data.event), event: parsed.data.event,
      title: redactTitle(rawTitle).slice(0, 120), ...(hint ? { hint } : {}), discriminator: parsed.data.event,
      ...delivery(meta, parsed.data.eventId, parsed.data.occurredAt, current), at: current });
    this.#records.set(id, {
      id,
      tool: 'openclaw',
      role: 'unknown',
      state: openClawState(parsed.data.event),
      project: parsed.data.cwd ? redactTitle(basename(parsed.data.cwd)).slice(0, 80) : undefined,
      title: redactTitle(rawTitle).slice(0, 120),
      firstSeenAt: this.#records.get(id)?.firstSeenAt ?? current.toISOString(),
      lastActivityAt: current.toISOString(),
      activityEvidence: { level: 'recent', source: 'openclaw-hook', observedAt: current.toISOString() },
      seenAt: current.getTime(),
    });
    return true;
  }

  workers(): Worker[] {
    this.prune();
    return [...this.#records.values()].map(({ seenAt, ...worker }) => {
      const age = this.now().getTime() - seenAt;
      const recent = age >= 0 && age <= 120_000;
      return { ...worker,
        state: !recent && worker.state === 'working' ? 'unknown' : worker.state,
        activityEvidence: { ...worker.activityEvidence!, level: recent ? 'recent' : 'detected' },
      };
    });
  }
}

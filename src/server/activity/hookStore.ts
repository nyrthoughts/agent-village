import { basename } from 'node:path';
import { z } from 'zod';
import type { Worker, WorkerState } from '../../shared/activity.js';
import { redactTitle } from './redact.js';

const sessionId = z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/);
const claudeEvent = z.object({
  session_id: sessionId,
  hook_event_name: z.string().min(1).max(80),
  cwd: z.string().min(1).max(2_048),
  agent_id: sessionId.optional(),
  agent_type: z.string().min(1).max(120).optional(),
}).passthrough();
const openClawEvent = z.object({
  sessionId,
  event: z.enum(['session_start', 'agent_start', 'agent_end', 'session_end']),
  title: z.string().max(240).optional(),
  cwd: z.string().max(2_048).optional(),
});

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

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMinutes = 30,
  ) {}

  ingestClaude(payload: unknown): boolean {
    const parsed = claudeEvent.safeParse(payload);
    if (!parsed.success) return false;
    const current = this.now();
    const leadId = `claude:${parsed.data.session_id}`;
    const isHelperEvent = parsed.data.hook_event_name === 'SubagentStart'
      || parsed.data.hook_event_name === 'SubagentStop';
    if (isHelperEvent && !parsed.data.agent_id) return false;
    const helperId = `${leadId}:helper:${parsed.data.agent_id ?? ''}`;
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
      seenAt: current.getTime(),
    });
    return true;
  }

  ingestOpenClaw(payload: unknown): boolean {
    const parsed = openClawEvent.safeParse(payload);
    if (!parsed.success) return false;
    const current = this.now();
    const id = `openclaw:${parsed.data.sessionId}`;
    const rawTitle = parsed.data.title?.trim()
      || (parsed.data.cwd ? basename(parsed.data.cwd) : '')
      || 'OpenClaw session';
    this.#records.set(id, {
      id,
      tool: 'openclaw',
      role: 'unknown',
      state: openClawState(parsed.data.event),
      project: parsed.data.cwd ? redactTitle(basename(parsed.data.cwd)).slice(0, 80) : undefined,
      title: redactTitle(rawTitle).slice(0, 120),
      firstSeenAt: this.#records.get(id)?.firstSeenAt ?? current.toISOString(),
      lastActivityAt: current.toISOString(),
      seenAt: current.getTime(),
    });
    return true;
  }

  workers(): Worker[] {
    const cutoff = this.now().getTime() - this.ttlMinutes * 60_000;
    for (const [id, record] of this.#records) {
      if (record.seenAt < cutoff) this.#records.delete(id);
    }
    return [...this.#records.values()].map(({ seenAt: _seenAt, ...worker }) => worker);
  }
}

import { basename } from 'node:path';
import { z } from 'zod';
import type { Worker, WorkerAttention, WorkerState } from '../../shared/activity.js';
import { redactTitle } from './redact.js';

const sessionId = z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/);
export const CLAUDE_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'Notification', 'PermissionRequest', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd'] as const;
type ClaudeHookEvent = typeof CLAUDE_HOOK_EVENTS[number];
/** Claude `Notification` types that mean the session waits for the owner. Other types change nothing. */
const NOTIFICATION_ATTENTION: Record<string, WorkerAttention['kind']> = {
  permission_prompt: 'approval', idle_prompt: 'input', elicitation_dialog: 'input',
};
/** Later events of the same session that answer or supersede a pending request. */
const CLEARS_ATTENTION: readonly ClaudeHookEvent[] = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SessionEnd'];
const claudeEvent = z.object({
  session_id: sessionId,
  hook_event_name: z.enum(CLAUDE_HOOK_EVENTS),
  cwd: z.string().min(1).max(2_048),
  agent_id: sessionId.optional(),
  agent_type: z.string().min(1).max(120).optional(),
  // Only the notification type is kept; `message` and any other text are stripped.
  notification_type: z.string().max(64).optional(),
}); // Claude sends extra fields; Zod strips them rather than retaining prompt/tool contents.
const openClawEvent = z.object({
  sessionId,
  event: z.enum(['session_start', 'agent_start', 'agent_end', 'session_end']),
  title: z.string().max(240).optional(),
  cwd: z.string().max(2_048).optional(),
});

interface StoredWorker extends Worker { seenAt: number }

function claudeState(event: string): WorkerState {
  if (event === 'Stop' || event === 'Notification' || event === 'PermissionRequest') return 'waiting';
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
    private readonly maxRecords = 1_000,
  ) {}

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
    const event = parsed.data.hook_event_name;
    const kind = event === 'PermissionRequest' ? 'approval' as const
      : event === 'Notification' ? NOTIFICATION_ATTENTION[parsed.data.notification_type ?? ''] : undefined;
    const attention: WorkerAttention | undefined = kind ? { kind, at: current.toISOString(), source: 'claude-hook' }
      : CLEARS_ATTENTION.includes(event) ? undefined : previous?.attention;
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
      ...(attention && event !== 'SubagentStart' ? { attention } : {}),
      seenAt: current.getTime(),
    });
    return true;
  }

  ingestOpenClaw(payload: unknown): boolean {
    const parsed = openClawEvent.safeParse(payload);
    if (!parsed.success) return false;
    const current = this.now();
    const id = `openclaw:${parsed.data.sessionId}`;
    this.reserve(id);
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

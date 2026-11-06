import { createHash } from 'node:crypto';
import type { EventInput, EventSource } from '../../shared/events.js';
import type { ObservedSession } from '../../shared/observation.js';
import { reduce, type BoardState } from '../../shared/projector.js';
import type { HookObservation } from '../activity/hookStore.js';
import { projectId } from '../activity/projectObserver.js';
import { redactTitle } from '../activity/redact.js';

export function digest(...parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
}

/**
 * Source-stable hook identity, in order of strength:
 * 1. a producer `event_id`, generated once per lifecycle event and reused on every retry;
 * 2. a tool call identity (`tool_use_id`) with the event name and helper id;
 * 3. legacy metadata-only hooks: nothing identifies a delivery, so the receiving second is
 *    part of the key. Retries are merged only within the same second; this is a stated limit,
 *    not a guarantee. A resumed session therefore still produces new lifecycle events.
 * `occurredAt` is the producer time when supplied, the server receipt otherwise.
 * Hook identities are never matched to a project here: see `sessionProject`.
 */
export function hookEvent(observation: HookObservation): EventInput {
  const identity = observation.eventId ? ['event', observation.eventId]
    : observation.toolUseId ? ['tool-use', observation.discriminator]
      : ['receipt-second', observation.discriminator, Math.floor(observation.at.getTime() / 1000)];
  return {
    key: `${observation.tool}-hook:${digest(observation.sessionId, ...identity)}`,
    kind: 'session.signal',
    source: observation.tool === 'claude' ? 'claude-hook' : 'openclaw-hook',
    provenance: 'observed',
    sessionId: observation.sessionId,
    occurredAt: (observation.occurredAt ?? observation.at).toISOString(),
    data: {
      tool: observation.tool, role: observation.role, state: observation.state, hookEvent: observation.event.slice(0, 40),
      ...(observation.title ? { title: observation.title } : {}),
      ...(observation.hint ? { hint: observation.hint } : {}),
      ...(observation.parentId ? { parentId: observation.parentId } : {}),
    },
  };
}

const evidenceSource: Record<string, EventSource> = {
  'codex-journal': 'codex-journal', 'codex-index': 'codex-index', 'claude-journal': 'claude-journal', 'claude-process': 'claude-process',
};

/** All events describing one native snapshot, with keys derived from source content. */
export function nativeSnapshotEvents(sessions: readonly ObservedSession[]): EventInput[] {
  const inputs: EventInput[] = [];
  for (const session of sessions) {
    if (session.projectKey.startsWith('hook:')) continue;
    const source = evidenceSource[session.activityEvidence?.source ?? ''] ?? (session.tool === 'claude' ? 'claude-journal' : 'codex-journal');
    const occurredAt = session.activityEvidence?.observedAt ?? session.lastActivityAt;
    if (!Number.isFinite(Date.parse(occurredAt))) continue;
    const tool = session.tool === 'claude' || session.tool === 'codex' ? session.tool : 'other';
    const title = redactTitle(session.title ?? session.id).slice(0, 120) || session.id.slice(0, 120);
    const data = {
      tool, role: session.role ?? 'unknown', state: session.state, level: session.activityEvidence?.level ?? 'detected',
      title, projectName: (session.project ?? '').slice(0, 160),
      ...(session.parentId ? { parentId: session.parentId } : {}),
      ...(session.cwd ? { cwd: session.cwd.slice(0, 1024) } : {}),
      ...(session.terminal ? { terminal: session.terminal.slice(0, 120) } : {}),
      ...(session.branch ? { branch: session.branch.slice(0, 200) } : {}),
      ...(session.repo ? { repo: session.repo } : {}),
    } as const;
    inputs.push({ key: `${source}:session:${digest(session.id, occurredAt, data)}`, kind: 'session.observed', source, provenance: 'observed',
      sessionId: session.id, projectId: projectId(session.projectKey), occurredAt, data });
    const updateSource: EventSource = tool === 'claude' ? 'claude-journal' : 'codex-journal';
    for (const update of [...session.history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
      if (!Number.isFinite(Date.parse(update.at))) continue;
      inputs.push({ key: `${updateSource}:update:${digest(session.id, update.kind, update.at, update.text)}`, kind: 'session.update',
        source: updateSource, provenance: 'declared', sessionId: session.id, projectId: projectId(session.projectKey), occurredAt: update.at,
        data: { tool, kind: update.kind, text: update.text.slice(0, 2400), title } });
    }
  }
  return inputs;
}

/**
 * Snapshot → events by diff against the current projection: only inputs that would change an
 * entity are returned, so an unchanged re-read (including after a restart) produces nothing.
 */
export function snapshotEvents(sessions: readonly ObservedSession[], state: BoardState): EventInput[] {
  const probeAt = new Date().toISOString();
  let probe = state;
  return nativeSnapshotEvents(sessions).filter((input) => {
    const next = reduce(probe, { ...input, occurredAt: new Date(input.occurredAt).toISOString(), seq: probe.seq + 1, receivedAt: probeAt } as never);
    if (next === probe) return false;
    probe = next;
    return true;
  });
}

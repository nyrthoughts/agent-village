import type { ActivityStatus } from './statuses.js';

export type WorkerState = 'working' | 'waiting' | 'idle' | 'unknown';
export type WorkerTool = 'codex' | 'claude' | 'gemini' | 'openclaw' | 'other';
/** Which client started a session, when the source records it. Unknown values stay `unknown`. */
export const SESSION_ORIGINS = ['cli', 'desktop', 'ide', 'exec', 'cloud', 'unknown'] as const;
export type SessionOrigin = typeof SESSION_ORIGINS[number];
/**
 * A "needs you" signal from a structured source event (never inferred from text).
 * Only the kind and timestamp are kept; notification messages are discarded.
 */
export interface WorkerAttention {
  kind: 'approval' | 'input';
  at: string;
  source: 'claude-hook' | 'codex-journal';
}
export type WorkerRole = 'lead' | 'helper' | 'unknown';
export interface WorkerActivityEvidence {
  /** Detected = record exists; recent = source changed; confirmed = a live process was observed with fresh declared state. */
  level: 'detected' | 'recent' | 'confirmed';
  source: 'codex-index' | 'codex-journal' | 'claude-journal' | 'claude-process' | 'claude-hook' | 'gemini-chat' | 'openclaw-hook';
  /** Timestamp of the supporting observation, never a guarantee of continuous work. */
  observedAt: string;
}

export interface Worker {
  id: string;
  tool: WorkerTool;
  role?: WorkerRole;
  state: WorkerState;
  parentId?: string;
  firstSeenAt?: string;
  project?: string;
  attachedTaskId?: string;
  lastActivityAt: string;
  title?: string;
  activityEvidence?: WorkerActivityEvidence;
  origin?: SessionOrigin;
  attention?: WorkerAttention;
  failure?: { at: string; source: 'claude-hook' };
}

export interface ActivitySnapshot {
  status: ActivityStatus;
  fetchedAt: string;
  workers: Worker[];
}

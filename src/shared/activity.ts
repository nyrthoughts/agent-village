import type { ActivityStatus } from './statuses.js';

export type WorkerState = 'working' | 'waiting' | 'idle' | 'unknown';
export type WorkerTool = 'codex' | 'claude' | 'openclaw' | 'other';
export type WorkerRole = 'lead' | 'helper' | 'unknown';
export interface WorkerActivityEvidence {
  /** Detected = record exists; recent = source changed; confirmed = a live process was observed with fresh declared state. */
  level: 'detected' | 'recent' | 'confirmed';
  source: 'codex-index' | 'codex-journal' | 'claude-journal' | 'claude-process' | 'claude-hook' | 'openclaw-hook';
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
}

export interface ActivitySnapshot {
  status: ActivityStatus;
  fetchedAt: string;
  workers: Worker[];
}

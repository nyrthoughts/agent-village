import type { ActivityStatus } from './statuses.js';

export type WorkerState = 'working' | 'waiting' | 'idle' | 'unknown';
export type WorkerTool = 'codex' | 'claude' | 'openclaw' | 'other';
export type WorkerRole = 'lead' | 'helper' | 'unknown';

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
}

export interface ActivitySnapshot {
  status: ActivityStatus;
  fetchedAt: string;
  workers: Worker[];
}

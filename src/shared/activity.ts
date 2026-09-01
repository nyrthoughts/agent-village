import type { ActivityStatus } from './statuses.js';

export type WorkerState = 'working' | 'waiting' | 'idle' | 'unknown';
export type WorkerTool = 'codex' | 'claude' | 'openclaw' | 'other';

export interface Worker {
  id: string;
  tool: WorkerTool;
  state: WorkerState;
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

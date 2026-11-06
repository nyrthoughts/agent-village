import type { Worker } from './activity.js';

export interface ObservedUpdate {
  at: string;
  kind: 'request' | 'report';
  text: string;
}
export interface ObservedSession extends Worker {
  projectKey: string;
  objective?: string;
  summary?: string;
  history: ObservedUpdate[];
  terminal?: string;
  sourceNote?: string;
  /** Native working directory (private board only), used for a copy-only resume command. */
  cwd?: string;
  /** Current branch of the working directory when it is a Git checkout. */
  branch?: string;
  /** Normalized GitHub `owner/name` from the checkout's origin remote. */
  repo?: string;
}
export interface ProjectObservation {
  buildingFamilyIndex?: number;
  sessions: ObservedSession[];
  lastActivityAt: string;
}

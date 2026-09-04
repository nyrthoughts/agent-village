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
}
export interface ProjectObservation {
  sessions: ObservedSession[];
  lastActivityAt: string;
}

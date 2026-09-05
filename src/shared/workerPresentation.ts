import type { Worker, WorkerState } from './activity.js';

export function hasRecentActivity(worker: Worker, now = Date.now()): boolean {
  const evidence = worker.activityEvidence;
  if (!evidence || !['recent', 'confirmed'].includes(evidence.level)) return false;
  const age = now - Date.parse(evidence.observedAt);
  return Number.isFinite(age) && age >= 0 && age <= 120_000;
}

/** A recent source update alone is not evidence that an agent is still working. */
export function isConfirmedWorking(worker: Worker, now = Date.now()): boolean {
  return worker.state === 'working' && worker.activityEvidence?.level === 'confirmed' && hasRecentActivity(worker, now);
}

export function presentWorkerState(worker: Worker, native: boolean, now = Date.now()): WorkerState {
  if (worker.state !== 'working') return worker.state;
  // Fictional demo workers can animate without real-world evidence. Native workers cannot.
  if (!native && !worker.activityEvidence) return 'working';
  return isConfirmedWorking(worker, now) ? 'working' : 'unknown';
}

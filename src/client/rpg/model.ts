import type { DerivedProject } from '../../server/truth/derive.js';
import type { Worker } from '../../shared/activity.js';
import { hasRecentActivity } from '../../shared/workerPresentation.js';

export const RPG_STATES = ['working', 'idle', 'approval', 'input', 'error', 'offline'] as const;
export type RpgState = typeof RPG_STATES[number];
export const LOTS_PER_MAP = 8;
export const ROOFS = ['blue', 'green', 'orange', 'red', 'purple'] as const;
export type Roof = typeof ROOFS[number];

export function sessionState(worker: Worker, now: number): RpgState {
  if (worker.failure?.source === 'claude-hook' && worker.tool === 'claude') return 'error';
  const signal = worker.attention;
  if (signal?.source === 'claude-hook' && worker.tool === 'claude') return signal.kind;
  // The local doctor has not confirmed a Codex approval source.

  if (worker.state === 'working' && hasRecentActivity(worker, now)) return 'working';
  return hasRecentActivity(worker, now) ? 'idle' : 'offline';
}

function hash(key: string): number {
  let value = 2166136261;
  for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619);
  return value >>> 0;
}

export function persona(worker: Pick<Worker, 'tool' | 'id'>, override?: number): string | undefined {
  const guild = worker.tool === 'claude' ? 'artisan' : worker.tool === 'codex' ? 'scholar' : undefined;
  if (!guild) return undefined;
  const index = override !== undefined && Number.isInteger(override) && override >= 0 && override < 16
    ? override : hash(`${worker.tool}:${worker.id}`) % 16;
  return `${guild}-${String(index).padStart(2, '0')}`;
}

function activityAt(project: DerivedProject): number {
  return Date.parse(project.observation?.lastActivityAt ?? '') || 0;
}

// Initial activity order fills the horseshoe. Later polls keep existing lots and fill the first vacancy.
export function assignLots(projects: readonly DerivedProject[], prior: readonly (string | null)[] = []): (string | null)[] {
  const candidates = projects.filter((project) => !project.observation?.unassigned);
  const ids = new Set(candidates.map(({ id }) => id));
  const slots = prior.map((id) => id && ids.delete(id) ? id : null);
  const newcomers = candidates.filter(({ id }) => ids.has(id))
    .sort((a, b) => activityAt(b) - activityAt(a) || a.id.localeCompare(b.id));
  for (const { id } of newcomers) {
    const free = slots.indexOf(null);
    if (free === -1) slots.push(id);
    else slots[free] = id;
  }
  while (slots.at(-1) === null) slots.pop();
  return slots;
}

export function projectRoof(id: string): Roof {
  return ROOFS[hash(id) % ROOFS.length]!;
}

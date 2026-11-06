import type { ProjectPlansById } from './projectPlan.js';
import type { BoardState } from './projector.js';
import type { VillageEvent } from './events.js';

/** Health of one source. Status is derived with the reader's clock, never stored. */
export interface SourceHealth {
  id: string;
  label: string;
  /** poll/watch sources have an expected cadence; push sources only report what arrived. */
  kind: 'poll' | 'push' | 'fixture';
  cadenceMs?: number;
  lastOkAt?: string;
  lastErrorAt?: string;
  /** Short diagnostic code or sentence, never a path or payload. */
  lastError?: string;
  warning?: string;
  /** Collection paused because no owner session is active. */
  paused?: boolean;
}
export type SourceStatus = 'ok' | 'stale' | 'unreachable' | 'waiting' | 'paused' | 'fixture';

/** Stale beyond three times the expected cadence; unreachable when the latest attempt failed. */
export function sourceStatus(source: SourceHealth, now: number): SourceStatus {
  if (source.kind === 'fixture') return 'fixture';
  if (source.paused) return 'paused';
  const ok = source.lastOkAt ? Date.parse(source.lastOkAt) : undefined;
  const error = source.lastErrorAt ? Date.parse(source.lastErrorAt) : undefined;
  if (error !== undefined && (ok === undefined || error >= ok)) return 'unreachable';
  if (ok === undefined) return 'waiting';
  if (source.kind === 'poll' && source.cadenceMs && now - ok > 3 * source.cadenceMs) return 'stale';
  return 'ok';
}

export interface BoardCapabilities { stream: boolean; editPlans: boolean; mapProjects: boolean }

export interface BoardSnapshot {
  epoch: string;
  seq: number;
  state: BoardState;
  plans: ProjectPlansById;
  health: SourceHealth[];
  mode: 'demo' | 'live' | 'native' | 'truth-only';
  /** True for every snapshot built from fictional fixture data. */
  fictional: boolean;
  generatedAt: string;
  capabilities: BoardCapabilities;
  errors: string[];
}

export type BoardContext = Pick<BoardSnapshot, 'plans' | 'health' | 'errors'>;

export type StreamMessage =
  | { type: 'event'; event: VillageEvent }
  | { type: 'context'; context: BoardContext }
  | { type: 'reset'; snapshot: BoardSnapshot }
  | { type: 'heartbeat'; seq: number; at: string }
  | { type: 'expired' };

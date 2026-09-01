import type { DerivedTask } from '../../server/truth/derive.js';
import type { Status } from '../../shared/statuses.js';

export type FloorKind = 'solid' | 'frame' | 'ghost';

export interface BuildingSpec3d {
  floorCount: number;
  floors: FloorKind[];
  solidFloors: number;
  frameFloors: number;
  ghostFloors: number;
  roof: boolean;
  scaffold: boolean;
  flag: boolean;
}

function floorKind(status: Status): FloorKind {
  if (status === 'verified' || status === 'awaiting_review') return 'solid';
  if (status === 'in_progress' || status === 'blocked') return 'frame';
  return 'ghost';
}

export function buildingSpec(task: DerivedTask): BuildingSpec3d {
  const statuses = (task.subtasks.length > 0
    ? task.subtasks.map((subtask) => subtask.effectiveStatus)
    : [task.effectiveStatus]).slice(0, 5);
  const floors = statuses.map(floorKind);

  return {
    floorCount: floors.length,
    floors,
    solidFloors: floors.filter((kind) => kind === 'solid').length,
    frameFloors: floors.filter((kind) => kind === 'frame').length,
    ghostFloors: floors.filter((kind) => kind === 'ghost').length,
    roof: task.roof,
    scaffold: task.effectiveStatus === 'blocked',
    flag: task.effectiveStatus === 'awaiting_review',
  };
}

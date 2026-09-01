import type { DerivedTask } from '../../server/truth/derive.js';
import type { Status } from '../../shared/statuses.js';

export type FloorVisual = 'material' | 'frame' | 'blueprint' | 'review' | 'blocked';

export interface FloorSpec {
  id: string;
  title: string;
  status: Status;
  visual: FloorVisual;
}

export interface BuildingSpec {
  floors: FloorSpec[];
  scaffold: boolean;
  flag: boolean;
  roof: boolean;
}

export function floorVisual(status: Status): FloorVisual {
  switch (status) {
    case 'verified': return 'material';
    case 'in_progress': return 'frame';
    case 'planned': return 'blueprint';
    case 'awaiting_review': return 'review';
    case 'blocked': return 'blocked';
  }
}

export function buildingLayout(task: DerivedTask): BuildingSpec {
  const sourceFloors = task.subtasks.length > 0
    ? task.subtasks
    : [{ id: task.id, title: task.title, effectiveStatus: task.effectiveStatus }];
  return {
    floors: sourceFloors.map((floor) => ({
      id: floor.id,
      title: floor.title,
      status: floor.effectiveStatus,
      visual: floorVisual(floor.effectiveStatus),
    })),
    scaffold: task.effectiveStatus === 'blocked',
    flag: task.effectiveStatus === 'awaiting_review',
    roof: task.roof,
  };
}

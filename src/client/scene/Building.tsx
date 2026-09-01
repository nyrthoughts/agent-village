import type { DerivedTask } from '../../server/truth/derive.js';
import type { Worker as WorkerData } from '../../shared/activity.js';
import { buildingLayout } from './buildingLayout.js';
import { Flag } from './Flag.js';
import { Floor } from './Floor.js';
import { Roof } from './Roof.js';
import { Scaffold } from './Scaffold.js';
import { Worker } from './Worker.js';

const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  blocked: 'Blocked',
  verified: 'Verified',
} as const;

export interface BuildingProps {
  task: DerivedTask;
  animated?: boolean;
  workers?: readonly WorkerData[];
  onSelect?: (task: DerivedTask, trigger: HTMLButtonElement) => void;
}

export function Building({ task, animated = false, workers = [], onSelect }: BuildingProps) {
  const spec = buildingLayout(task);
  const visibleFloors = spec.floors.slice(0, 5);
  const top = 116 - Math.max(0, visibleFloors.length - 1) * 22;
  const statusLabel = STATUS_LABELS[task.effectiveStatus];

  return (
    <button
      type="button"
      className={`building building--${task.effectiveStatus}${animated ? ' building--animated' : ''}`}
      data-task-id={task.id}
      data-status={task.effectiveStatus}
      aria-label={`${task.title}. ${statusLabel}. ${task.owner ? `Owner ${task.owner}.` : 'No owner.'}`}
      onClick={(event) => onSelect?.(task, event.currentTarget)}
    >
      <span className="building__model" aria-hidden="true">
        <svg viewBox="0 0 104 150" role="img">
          <ellipse className="building__shadow" cx="52" cy="133" rx="43" ry="12" />
          {visibleFloors.map((floor, index) => <Floor key={floor.id} floor={floor} index={index} />)}
          {spec.roof && <Roof y={top - 4} />}
          {spec.scaffold && <Scaffold top={top - 24} />}
          {spec.flag && <Flag top={top - 12} />}
        </svg>
      </span>
      <span className="building__caption">
        <strong>{task.title}</strong>
        <span className="building__meta">{statusLabel}{task.owner ? ` · ${task.owner}` : ''}</span>
      </span>
      {workers.length > 0 && <span className="building__workers" style={{ top: `${Math.max(70, top - 8)}px` }} aria-label={`${workers.length} active workers`}>{workers.map((worker) => <Worker key={worker.id} worker={worker} />)}</span>}
    </button>
  );
}

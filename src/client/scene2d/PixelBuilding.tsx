import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';

const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  blocked: 'Blocked',
  verified: 'Verified',
} as const;

const VARIANTS = {
  planned: 'plot',
  in_progress: 'construction',
  awaiting_review: 'review',
  blocked: 'blocked',
  verified: 'complete',
} as const;

interface PixelBuildingProps {
  task: DerivedTask;
  project: DerivedProject;
  variant: number;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
}

export function PixelBuilding({ task, project, variant, onSelect }: PixelBuildingProps) {
  const status = STATUS_LABELS[task.effectiveStatus];
  return (
    <button
      type="button"
      className={`pixel-building pixel-building--${task.effectiveStatus}`}
      data-testid={`pixel-building-${task.id}`}
      data-task-id={task.id}
      data-building-variant={VARIANTS[task.effectiveStatus]}
      data-roof-palette={variant}
      aria-label={`${task.title}. ${status}. ${task.owner ? `Owner ${task.owner}.` : 'No owner.'}`}
      onClick={(event) => onSelect(task, event.currentTarget, project)}
    >
      <span className="pixel-building__shadow" aria-hidden="true" />
      <span className="pixel-building__plot" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="pixel-building__body" aria-hidden="true">
        <span className="pixel-building__roof" />
        <span className="pixel-building__wall" />
        <span className="pixel-building__door" />
        <span className="pixel-building__window pixel-building__window--left" />
        <span className="pixel-building__window pixel-building__window--right" />
        <span className="pixel-building__frame"><i /><i /><i /></span>
      </span>
      <span className="pixel-building__status-mark" aria-hidden="true" />
      <span className="pixel-building__label"><strong>{task.title}</strong><small>{status}</small></span>
    </button>
  );
}

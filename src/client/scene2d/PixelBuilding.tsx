import type { CSSProperties } from 'react';
import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';
import { buildingFamilyFor } from './buildingFamilies.js';

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
  const status = project.observation
    ? `${project.observation.sessions.length} sessions · ${project.observation.sessions.filter((session) => session.state === 'working').length} en cours`
    : STATUS_LABELS[task.effectiveStatus];
  const family = buildingFamilyFor(task.id);
  const familyStyle = {
    '--building-roof': family.roofColor,
    '--building-roof-light': family.roofLight,
    '--building-roof-dark': family.roofDark,
    '--building-wall': family.wallColor,
    '--building-wall-light': family.wallLight,
    '--building-wall-dark': family.wallDark,
    '--building-trim': family.trimColor,
  } as CSSProperties;
  return (
    <button
      type="button"
      className={`pixel-building pixel-building--${task.effectiveStatus}`}
      data-testid={`pixel-building-${task.id}`}
      data-task-id={task.id}
      data-building-variant={VARIANTS[task.effectiveStatus]}
      data-stage={project.observation ? 'roof' : task.progress.stage}
      data-observed={project.observation ? 'true' : undefined}
      data-family={family.id}
      data-roof-shape={family.roof}
      data-roof-palette={variant}
      data-sprite-scale="compact"
      style={familyStyle}
      aria-label={`${task.title}. ${status}. ${task.owner ? `Owner ${task.owner}.` : 'No owner.'}`}
      onClick={(event) => onSelect(task, event.currentTarget, project)}
    >
      <span className="pixel-building__shadow" aria-hidden="true" />
      <span className="pixel-building__plot" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="pixel-building__body" aria-hidden="true">
        <span className="pixel-building__roof" />
        <span className="pixel-building__wall" />
        <span className="pixel-building__door" />
        <span className="pixel-building__porch" />
        <span className="pixel-building__window pixel-building__window--left" />
        <span className="pixel-building__window pixel-building__window--right" />
        <span className="pixel-building__frame"><i /><i /><i /></span>
      </span>
      <span className="pixel-building__status-mark" aria-hidden="true" />
      <span className="pixel-building__label"><strong>{task.title}</strong><small>{status}</small></span>
    </button>
  );
}

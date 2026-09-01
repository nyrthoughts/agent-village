import type { DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { CameraProjection } from './cameraController.js';

const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  blocked: 'Blocked',
  verified: 'Verified',
} as const;

interface SceneLabelsProps {
  village: DerivedWorkspace;
  positions: Readonly<Record<string, CameraProjection>>;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
  onFocusTask: (taskId: string, focused: boolean) => void;
}

export function SceneLabels({ village, positions, onSelect, onFocusTask }: SceneLabelsProps) {
  const records = village.projects.flatMap((project) => [
    ...project.features.flatMap((feature) => feature.tasks.map((task) => ({ task, project }))),
    ...project.tasks.map((task) => ({ task, project })),
  ]);

  return (
    <div className="scene-labels" aria-label="3D village buildings">
      {village.projects.map((project) => {
        const position = positions[`project:${project.id}`] ?? { x: -100, y: -100, visible: false };
        return (
          <div
            key={project.id}
            className="scene-district-label"
            data-visible={String(position.visible)}
            style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)` }}
          >
            <span>District</span>
            <strong>{project.name}</strong>
          </div>
        );
      })}
      {records.map(({ task, project }) => {
        const position = positions[task.id] ?? { x: -100, y: -100, visible: false };
        const status = STATUS_LABELS[task.effectiveStatus];
        return (
          <button
            key={task.id}
            type="button"
            className={`scene-label scene-label--${task.effectiveStatus}`}
            data-scene-task-id={task.id}
            data-visible={String(position.visible)}
            style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -100%)` }}
            aria-label={`${task.title}. ${status}. ${task.owner ? `Owner ${task.owner}.` : 'No owner.'}`}
            onFocus={() => onFocusTask(task.id, true)}
            onBlur={() => onFocusTask(task.id, false)}
            onClick={(event) => onSelect(task, event.currentTarget, project)}
          >
            <span className="scene-label__status" aria-hidden="true" />
            <span>{task.title}</span>
          </button>
        );
      })}
    </div>
  );
}

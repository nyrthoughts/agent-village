import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';
import { isConfirmedWorking } from '../../shared/workerPresentation.js';
import { BUILDING_FAMILIES, buildingFamilyFor } from './buildingFamilies.js';
import { BuildingArtwork, type BuildingStage } from './BuildingArtwork.js';
import { translate, type Language } from '../language.js';
import './buildings.css';

const STATUS_LABELS = {
  planned: 'Planned', in_progress: 'In progress', awaiting_review: 'Awaiting review', blocked: 'Blocked', verified: 'Verified',
} as const;
const VARIANTS = {
  planned: 'plot', in_progress: 'construction', awaiting_review: 'review', blocked: 'blocked', verified: 'complete',
} as const;

interface PixelBuildingProps {
  now?: number;
  language?: Language;
  task: DerivedTask;
  project: DerivedProject;
  variant: number;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
}

export function PixelBuilding({ task, project, variant, onSelect, language = 'en', now = Date.now() }: PixelBuildingProps) {
  const unknown = task.progress.total === 0 || Boolean(project.observation && !project.plan);
  const stage: BuildingStage = unknown ? 'survey' : task.progress.stage;
  const status = unknown ? translate(language, 'Plan à définir') : project.observation
    ? translate(language, '{done}/{total} jalons validés', { done: task.progress.verified, total: task.progress.total })
    : STATUS_LABELS[task.effectiveStatus];
  const commonHouse = task.id === project.id;
  const working = commonHouse && project.observation?.sessions.some((session) => isConfirmedWorking(session, now));
  const family = commonHouse && project.observation?.buildingFamilyIndex !== undefined
    ? BUILDING_FAMILIES[project.observation.buildingFamilyIndex % BUILDING_FAMILIES.length]!
    : buildingFamilyFor(task.id);
  return <button
    type="button"
    className={`pixel-building traveler-building pixel-building--${task.effectiveStatus}`}
    data-testid={`pixel-building-${task.id}`}
    data-task-id={task.id}
    data-building-variant={unknown ? 'survey' : VARIANTS[task.effectiveStatus]}
    data-stage={stage}
    data-observed={project.observation ? 'true' : undefined}
    data-working={working ? 'true' : undefined}
    data-family={family.id}
    data-roof-shape={family.roof}
    data-roof-palette={variant}
    data-sprite-scale="compact"
    aria-label={`${task.title}. ${status}.${project.observation ? '' : ` ${task.owner ? translate(language, 'Responsable {name}.', { name: task.owner }) : translate(language, 'Sans responsable.')}`}`}
    onClick={(event) => onSelect(task, event.currentTarget, project)}
  >
    <BuildingArtwork family={family} stage={stage} />
    {working && <span className="traveler-building__working" aria-hidden="true" />}
    {task.effectiveStatus === 'blocked' && <span className="traveler-building__alert" aria-hidden="true">!</span>}
    <span className="pixel-building__label"><strong>{task.title}</strong><small>{status}</small></span>
  </button>;
}

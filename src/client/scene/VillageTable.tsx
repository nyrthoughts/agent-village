import type { DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot, Worker as WorkerData } from '../../shared/activity.js';
import { animatedTaskIds } from './animations.js';
import { District } from './District.js';
import { allTasks, orderedProjects } from './layout.js';
import { Worker } from './Worker.js';

interface VillageTableProps {
  village: DerivedWorkspace;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
  activity?: ActivitySnapshot;
}

export function VillageTable({ village, activity, onSelect }: VillageTableProps) {
  const animatedIds = animatedTaskIds(allTasks(village));
  const workersByTask = new Map<string, WorkerData[]>();
  for (const worker of activity?.workers ?? []) {
    if (!worker.attachedTaskId) continue;
    workersByTask.set(worker.attachedTaskId, [...(workersByTask.get(worker.attachedTaskId) ?? []), worker]);
  }
  const unassigned = (activity?.workers ?? []).filter((worker) => !worker.attachedTaskId);
  return (
    <section className="village-table" aria-label={`${village.name} architect table`}>
      <div className="village-table__grain" aria-hidden="true" />
      <div className="village-table__districts">
        {orderedProjects(village.projects).map((project) => (
          <District key={project.id} project={project} animatedIds={animatedIds} workersByTask={workersByTask} onSelect={onSelect} />
        ))}
      </div>
      {unassigned.length > 0 && <aside className="unassigned-workers" aria-label="Unassigned workers"><span>Unassigned</span>{unassigned.map((worker) => <Worker key={worker.id} worker={worker} />)}</aside>}
    </section>
  );
}

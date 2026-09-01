import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';
import type { Worker } from '../../shared/activity.js';
import { Building } from './Building.js';
import { Compound } from './Compound.js';
import { orderedFeatures, orderedTasks } from './layout.js';

interface DistrictProps {
  project: DerivedProject;
  animatedIds: ReadonlySet<string>;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
  workersByTask: ReadonlyMap<string, readonly Worker[]>;
}

export function District({ project, animatedIds, onSelect, workersByTask }: DistrictProps) {
  const select = (task: DerivedTask, trigger: HTMLButtonElement) => onSelect(task, trigger, project);
  return (
    <article className={`district district--${project.effectiveStatus}`} aria-labelledby={`project-${project.id}`}>
      <header className="district__header">
        <span className="district__index">District / {project.id}</span>
        <div>
          <h2 id={`project-${project.id}`}>{project.name}</h2>
          <p>{project.objective}</p>
        </div>
        <span className={`district__status district__status--${project.effectiveStatus}`}>{project.effectiveStatus.replace('_', ' ')}</span>
      </header>
      <div className="district__terrain">
        {orderedFeatures(project.features).map((feature) => (
          <Compound key={feature.id} feature={feature} animatedIds={animatedIds} workersByTask={workersByTask} onSelect={select} />
        ))}
        {project.tasks.length > 0 && (
          <section className="compound compound--standalone" aria-label={`${project.name} standalone tasks`}>
            <div className="compound__label"><h3>Open yard</h3></div>
            <div className="compound__plot">
              {orderedTasks(project.tasks).map((task) => (
                <Building key={task.id} task={task} animated={animatedIds.has(task.id)} workers={workersByTask.get(task.id)} onSelect={select} />
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

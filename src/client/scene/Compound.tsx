import type { DerivedFeature, DerivedTask } from '../../server/truth/derive.js';
import type { Worker } from '../../shared/activity.js';
import { Building } from './Building.js';
import { orderedTasks } from './layout.js';

interface CompoundProps {
  feature: DerivedFeature;
  animatedIds: ReadonlySet<string>;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement) => void;
  workersByTask: ReadonlyMap<string, readonly Worker[]>;
}

export function Compound({ feature, animatedIds, onSelect, workersByTask }: CompoundProps) {
  return (
    <section className="compound" aria-labelledby={`feature-${feature.id}`}>
      <div className="compound__label">
        <span className="compound__pin" aria-hidden="true" />
        <h3 id={`feature-${feature.id}`}>{feature.title}</h3>
      </div>
      <div className="compound__plot">
        {orderedTasks(feature.tasks).map((task) => (
          <Building key={task.id} task={task} animated={animatedIds.has(task.id)} workers={workersByTask.get(task.id)} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

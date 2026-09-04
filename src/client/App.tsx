import { useState } from 'react';
import type { DerivedProject, DerivedTask } from '../server/truth/derive.js';
import type { Worker } from '../shared/activity.js';
import { useActivity } from './hooks/useActivity.js';
import { useVillage } from './hooks/useVillage.js';
import { DetailDrawer } from './drawer/DetailDrawer.js';
import { WorkerDrawer } from './drawer/WorkerDrawer.js';
import { AttentionList } from './mobile/AttentionList.js';
import { DegradedBanner } from './scene/DegradedBanner.js';
import { GameHud } from './hud/GameHud.js';
import { VillageMap2D } from './scene2d/VillageMap2D.js';
import { ObservedProjects } from './ObservedProjects.js';

type Selection =
  | { kind: 'task'; task: DerivedTask; project: DerivedProject; trigger: HTMLButtonElement }
  | { kind: 'worker'; worker: Worker; trigger: HTMLButtonElement };

export function App() {
  const village = useVillage();
  const activity = useActivity();
  const [selection, setSelection] = useState<Selection>();
  const select = (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) =>
    setSelection({ kind: 'task', task, trigger, project });
  const selectWorker = (worker: Worker, trigger: HTMLButtonElement) =>
    setSelection({ kind: 'worker', worker, trigger });

  if (!village.data && village.loading) return <main className="app-shell app-shell--center" aria-label="Agent Village"><p>Preparing the architect table…</p></main>;
  if (!village.data) return <main className="app-shell app-shell--center" aria-label="Agent Village"><section className="config-error" role="alert"><span>Configuration unavailable</span><strong>{village.error?.message ?? 'The village could not be loaded.'}</strong></section></main>;
  const workspace = village.data;
  if (workspace.observation) return <ObservedProjects village={workspace} activity={activity.data} error={village.error?.message} />;

  return (
    <main className="app-shell" aria-label="Agent Village">
      <section className="game-stage" aria-label={`${workspace.name} village map`}>
        <GameHud village={workspace} activity={activity.data} />
        {(activity.data?.status === 'degraded' || activity.error) && <DegradedBanner />}
        {workspace.projects.length === 0
          ? <section className="empty-village"><h2>The village is quiet.</h2><p>Add a project to village.yaml to place the first district.</p></section>
          : <VillageMap2D village={workspace} activity={activity.data} onSelect={select} onSelectWorker={selectWorker} />}
        <footer className="table-legend">
          <span><i className="legend-swatch legend-swatch--wood" />Built</span><span><i className="legend-swatch legend-swatch--frame" />In progress</span><span><i className="legend-swatch legend-swatch--plan" />Planned</span><span><i className="legend-swatch legend-swatch--block" />Blocked</span>
        </footer>
      </section>
      <AttentionList village={workspace} onSelect={select} />
      {selection?.kind === 'task' && <DetailDrawer task={selection.task} project={selection.project} trigger={selection.trigger} workers={activity.data?.workers.filter((worker) => worker.attachedTaskId === selection.task.id)} onClose={() => setSelection(undefined)} />}
      {selection?.kind === 'worker' && <WorkerDrawer worker={selection.worker} helperCount={activity.data?.workers.filter((worker) => worker.parentId === selection.worker.id).length} trigger={selection.trigger} onClose={() => setSelection(undefined)} />}
    </main>
  );
}

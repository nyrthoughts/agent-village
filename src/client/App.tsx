import { useState } from 'react';
import type { DerivedProject, DerivedTask } from '../server/truth/derive.js';
import { useActivity } from './hooks/useActivity.js';
import { useVillage } from './hooks/useVillage.js';
import { DetailDrawer } from './drawer/DetailDrawer.js';
import { AttentionList } from './mobile/AttentionList.js';
import { DegradedBanner } from './scene/DegradedBanner.js';
import { GameHud } from './hud/GameHud.js';
import { VillageMap2D } from './scene2d/VillageMap2D.js';

interface Selection { task: DerivedTask; project: DerivedProject; trigger: HTMLButtonElement }

export function App() {
  const village = useVillage();
  const activity = useActivity();
  const [selection, setSelection] = useState<Selection>();
  const select = (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) =>
    setSelection({ task, trigger, project });

  if (!village.data && village.loading) return <main className="app-shell app-shell--center" aria-label="Agent Village"><p>Preparing the architect table…</p></main>;
  if (!village.data) return <main className="app-shell app-shell--center" aria-label="Agent Village"><section className="config-error" role="alert"><span>Configuration unavailable</span><strong>{village.error?.message ?? 'The village could not be loaded.'}</strong></section></main>;
  const workspace = village.data;

  return (
    <main className="app-shell" aria-label="Agent Village">
      <section className="game-stage" aria-label={`${workspace.name} village map`}>
        <GameHud village={workspace} activity={activity.data} />
        {(activity.data?.status === 'degraded' || activity.error) && <DegradedBanner />}
        {workspace.projects.length === 0
          ? <section className="empty-village"><h2>The village is quiet.</h2><p>Add a project to village.yaml to place the first district.</p></section>
          : <VillageMap2D village={workspace} activity={activity.data} onSelect={select} />}
        <footer className="table-legend">
          <span><i className="legend-swatch legend-swatch--wood" />Built</span><span><i className="legend-swatch legend-swatch--frame" />In progress</span><span><i className="legend-swatch legend-swatch--plan" />Planned</span><span><i className="legend-swatch legend-swatch--block" />Blocked</span>
        </footer>
      </section>
      <AttentionList village={workspace} onSelect={select} />
      {selection && <DetailDrawer task={selection.task} project={selection.project} trigger={selection.trigger} onClose={() => setSelection(undefined)} />}
    </main>
  );
}

import { useState } from 'react';
import type { DerivedProject, DerivedTask } from '../server/truth/derive.js';
import { useActivity } from './hooks/useActivity.js';
import { useVillage } from './hooks/useVillage.js';
import { DetailDrawer } from './drawer/DetailDrawer.js';
import { AttentionList } from './mobile/AttentionList.js';
import { DegradedBanner } from './scene/DegradedBanner.js';
import { VillageTable } from './scene/VillageTable.js';
import { VillageScene3D } from './scene3d/VillageScene3D.js';
import { WebGLBoundary } from './scene3d/WebGLBoundary.js';
import { LiveAgentsPanel } from './activity/LiveAgentsPanel.js';
import { VillageSummary } from './summary/VillageSummary.js';

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
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div className="topbar__title"><span>Agent Village · construction map</span><h1>{workspace.name}</h1></div>
        <div className="topbar__signals">
          <span className="live-dot" aria-label="Local server connected" />
          {activity.data?.status === 'demo' && <span className="mode-badge">Demo activity</span>}
          {activity.data?.status === 'live' && <span className="mode-badge mode-badge--live">Live activity</span>}
          {activity.data?.status === 'absent' && <span className="mode-badge">Truth only</span>}
        </div>
      </header>
      <VillageSummary village={workspace} activity={activity.data} />
      {(activity.data?.status === 'degraded' || activity.error) && <DegradedBanner />}
      <LiveAgentsPanel activity={activity.data} />
      {workspace.projects.length === 0
        ? <section className="empty-village"><h2>The table is clear.</h2><p>Add a project to village.yaml to place the first district.</p></section>
        : <WebGLBoundary fallback={<VillageTable village={workspace} activity={activity.data} onSelect={select} />}>
          {({ onUnavailable }) => <VillageScene3D village={workspace} activity={activity.data} onSelect={select} onUnavailable={onUnavailable} />}
        </WebGLBoundary>}
      <AttentionList village={workspace} onSelect={select} />
      <footer className="table-legend">
        <span><i className="legend-swatch legend-swatch--wood" />Built</span><span><i className="legend-swatch legend-swatch--frame" />In progress</span><span><i className="legend-swatch legend-swatch--plan" />Planned</span><span><i className="legend-swatch legend-swatch--block" />Blocked</span>
      </footer>
      {selection && <DetailDrawer task={selection.task} project={selection.project} trigger={selection.trigger} onClose={() => setSelection(undefined)} />}
    </main>
  );
}

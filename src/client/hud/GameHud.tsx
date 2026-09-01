import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot, WorkerTool } from '../../shared/activity.js';

interface GameHudProps { village: DerivedWorkspace; activity?: ActivitySnapshot }

const toolMarks: Record<WorkerTool, string> = {
  codex: 'C',
  claude: 'A',
  openclaw: 'O',
  other: '•',
};

function villageTasks(village: DerivedWorkspace): DerivedTask[] {
  return village.projects.flatMap((project) => [
    ...project.features.flatMap((feature) => feature.tasks),
    ...project.tasks,
  ]);
}

export function GameHud({ village, activity }: GameHudProps) {
  const tasks = villageTasks(village);
  const built = tasks.filter(({ effectiveStatus }) => effectiveStatus === 'verified').length;
  const alerts = tasks.filter(({ effectiveStatus }) => effectiveStatus === 'blocked' || effectiveStatus === 'awaiting_review').length;
  const workers = activity?.status === 'live' || activity?.status === 'demo' ? activity.workers.slice(0, 4) : [];
  const percent = tasks.length === 0 ? 0 : Math.round(built / tasks.length * 100);
  const mode = activity?.status === 'live' ? 'Live' : activity?.status === 'demo' ? 'Demo' : 'Truth only';

  return (
    <header className="game-hud" aria-label="Village HUD">
      <section className="game-hud__village">
        <div className="game-hud__crest" aria-hidden="true"><span /><i /></div>
        <div className="game-hud__identity">
          <span>Agent Village · <b>{mode}</b></span>
          <h1>{village.name}</h1>
          <div className="game-hud__progress">
            <i aria-hidden="true"><b style={{ width: `${percent}%` }} /></i>
            <strong>{built} of {tasks.length} built</strong>
            <small className={alerts > 0 ? 'game-hud__alerts game-hud__alerts--active' : 'game-hud__alerts'}>{alerts} alerts</small>
          </div>
        </div>
      </section>

      <section className="game-hud__party" aria-label="Agents in village">
        <header><span>Agent party</span><strong>{workers.length}</strong></header>
        {workers.length === 0
          ? <p>No visible agents</p>
          : <ul>{workers.map((worker) => (
            <li key={worker.id} title={`${worker.tool} · ${worker.state}`}>
              <i className={`game-hud__avatar game-hud__avatar--${worker.tool} game-hud__avatar--${worker.state}`} aria-hidden="true">{toolMarks[worker.tool]}</i>
              <span><strong>{worker.title ?? 'Untitled conversation'}</strong><small>{worker.project ?? worker.tool} · {worker.state}</small></span>
            </li>
          ))}</ul>}
      </section>
    </header>
  );
}

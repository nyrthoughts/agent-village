import type { ActivitySnapshot, WorkerTool } from '../../shared/activity.js';

interface LiveAgentsPanelProps { activity?: ActivitySnapshot }

const toolLabels: Record<WorkerTool, string> = {
  codex: 'Codex',
  claude: 'Claude',
  openclaw: 'OpenClaw',
  other: 'Other',
};

export function LiveAgentsPanel({ activity }: LiveAgentsPanelProps) {
  if (activity?.status !== 'live') return null;
  return (
    <section className="live-agents" aria-label="Live conversations">
      <header className="live-agents__header">
        <div><span>Activity plane</span><h2>Live conversations</h2></div>
        <strong>{activity.workers.length}</strong>
      </header>
      <ul>
        {activity.workers.map((worker) => (
          <li key={worker.id}>
            <i className={`live-agents__state live-agents__state--${worker.state}`} aria-hidden="true" />
            <div className="live-agents__identity">
              <strong>{worker.title ?? 'Untitled conversation'}</strong>
              <small>{worker.project ?? 'Unknown project'}</small>
            </div>
            <span className={`live-agents__tool live-agents__tool--${worker.tool}`}>{toolLabels[worker.tool]}</span>
            <span className="live-agents__status">{worker.state[0]?.toUpperCase()}{worker.state.slice(1)}</span>
            <small className={worker.attachedTaskId ? 'live-agents__mapping' : 'live-agents__mapping live-agents__mapping--unmapped'}>
              {worker.attachedTaskId ? `Building: ${worker.attachedTaskId}` : 'Unmapped'}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

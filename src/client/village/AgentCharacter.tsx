import type { WorkerTool, WorkerState } from '../../shared/activity.js';
import type { ObservedSession } from '../../shared/observation.js';
import { presentWorkerState } from '../../shared/workerPresentation.js';

const TOOL_ABBR: Record<WorkerTool, string> = {
  codex: 'Cx',
  claude: 'Cl',
  openclaw: 'OC',
  other: '?',
};

export function toolLabel(tool: WorkerTool): string {
  switch (tool) {
    case 'codex': return 'Codex';
    case 'claude': return 'Claude';
    case 'openclaw': return 'OpenClaw';
    default: return 'Forge';
  }
}

export function AgentCharacter({
  session,
  onClick,
}: {
  session: ObservedSession;
  onClick?: (session: ObservedSession, trigger: HTMLButtonElement) => void;
}) {
  const state: WorkerState = presentWorkerState(session, true);
  const tool = session.tool;
  const toolClass = tool === 'other' ? 'forge' : tool;

  return (
    <button
      type="button"
      className={`agent-char agent-char--${toolClass} agent-char--${state}`}
      aria-label={`${toolLabel(tool)} · ${session.title ?? session.id}`}
      onClick={(e) => onClick?.(session, e.currentTarget)}
    >
      <div className="agent-char__sprite">
        <div className="agent-char__hair" />
        <div className="agent-char__head" />
        <div className="agent-char__body">
          <span className="agent-char__badge">{TOOL_ABBR[tool] ?? 'F'}</span>
        </div>
        <div className="agent-char__legs" />
        <span className={`agent-char__status agent-char__status--${state}`} />
      </div>
      {state === 'working' && <span className="agent-char__bubble">···</span>}
    </button>
  );
}

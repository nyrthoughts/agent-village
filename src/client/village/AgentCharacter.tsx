import type { WorkerTool, WorkerState } from '../../shared/activity.js';
import type { ObservedSession } from '../../shared/observation.js';
import { presentWorkerState } from '../../shared/workerPresentation.js';

const TOOL_LABELS: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude',
  'claude-code': 'Claude Code',
  openclaw: 'OpenClaw',
  other: 'Forge',
};

export function toolLabel(tool: WorkerTool | string): string {
  return TOOL_LABELS[tool] ?? tool;
}

function spriteToolKey(tool: WorkerTool | string): string {
  if (tool === 'claude-code') return 'claude';
  if (tool === 'other') return 'forge';
  return tool;
}

export function AgentCharacter({
  session,
  onClick,
  size = 48,
}: {
  session: ObservedSession;
  onClick?: (session: ObservedSession, trigger: HTMLButtonElement) => void;
  size?: number;
}) {
  const state: WorkerState = presentWorkerState(session, true);
  const spriteKey = spriteToolKey(session.tool);
  const isWorking = state === 'working';
  const spriteFile = isWorking
    ? `/sprites/bot-${spriteKey}-walk.png`
    : `/sprites/bot-${spriteKey}-idle.png`;

  return (
    <button
      type="button"
      className={`raster-bot raster-bot--${state}`}
      aria-label={`${toolLabel(session.tool)} \u00B7 ${session.title ?? session.id}`}
      onClick={(e) => onClick?.(session, e.currentTarget)}
      style={{ width: size, height: size }}
    >
      <img
        src={spriteFile}
        alt=""
        className="raster-bot__img"
        draggable={false}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
      <span className={`raster-bot__status raster-bot__status--${state}`} />
      {isWorking && <span className="raster-bot__bubble">&middot;&middot;&middot;</span>}
    </button>
  );
}

import type { Worker, WorkerTool } from '../../shared/activity.js';

const TOOL_LABELS: Record<WorkerTool, string> = {
  codex: 'Codex',
  claude: 'Claude',
  openclaw: 'OpenClaw',
  other: 'Other',
};

const TOOL_MARKS: Record<WorkerTool, string> = { codex: 'C', claude: 'A', openclaw: 'O', other: '•' };

interface PixelWorkerProps {
  worker: Worker;
  helperCount?: number;
  onSelect?: (worker: Worker, trigger: HTMLButtonElement) => void;
}

export function PixelWorker({ worker, helperCount = 0, onSelect }: PixelWorkerProps) {
  const title = worker.title ?? 'Untitled conversation';
  const role = worker.role ?? 'unknown';
  const helperLabel = helperCount > 0
    ? `, ${helperCount} ${helperCount === 1 ? 'helper agent' : 'helper agents'}`
    : '';
  return (
    <button
      type="button"
      className={`pixel-worker pixel-worker--${worker.tool} pixel-worker--${worker.state} pixel-worker--${role}`}
      data-worker-id={worker.id}
      data-sprite-origin="original"
      aria-label={`${TOOL_LABELS[worker.tool]} ${role} agent, ${worker.state}, ${title}${helperLabel}`}
      onClick={(event) => onSelect?.(worker, event.currentTarget)}
    >
      <i className="pixel-worker__shadow" aria-hidden="true" />
      <i className="pixel-worker__head" aria-hidden="true"><b /></i>
      <i className="pixel-worker__body" aria-hidden="true" />
      <i className="pixel-worker__legs" aria-hidden="true" />
      <b className="pixel-worker__badge" aria-hidden="true">{TOOL_MARKS[worker.tool]}</b>
      {worker.state === 'waiting' && <em className="pixel-worker__bubble" data-testid="worker-bubble">…</em>}
      {helperCount > 0 && <span className="pixel-worker__count" aria-hidden="true">{helperCount}</span>}
    </button>
  );
}

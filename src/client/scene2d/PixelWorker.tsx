import type { Worker, WorkerTool } from '../../shared/activity.js';

const TOOL_LABELS: Record<WorkerTool, string> = {
  codex: 'Codex',
  claude: 'Claude',
  openclaw: 'OpenClaw',
  other: 'Other',
};

const TOOL_MARKS: Record<WorkerTool, string> = { codex: 'C', claude: 'A', openclaw: 'O', other: '•' };

interface PixelWorkerProps { worker: Worker }

export function PixelWorker({ worker }: PixelWorkerProps) {
  const title = worker.title ?? 'Untitled conversation';
  return (
    <span
      className={`pixel-worker pixel-worker--${worker.tool} pixel-worker--${worker.state}`}
      data-worker-id={worker.id}
      data-sprite-origin="original"
      aria-label={`${TOOL_LABELS[worker.tool]} worker, ${worker.state}, ${title}`}
    >
      <i className="pixel-worker__shadow" aria-hidden="true" />
      <i className="pixel-worker__head" aria-hidden="true"><b /></i>
      <i className="pixel-worker__body" aria-hidden="true" />
      <i className="pixel-worker__legs" aria-hidden="true" />
      <b className="pixel-worker__badge" aria-hidden="true">{TOOL_MARKS[worker.tool]}</b>
      {worker.state === 'waiting' && <em className="pixel-worker__bubble" data-testid="worker-bubble">…</em>}
    </span>
  );
}

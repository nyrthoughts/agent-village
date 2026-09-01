import type { Worker as WorkerData } from '../../shared/activity.js';

const TOOL_MARK = { codex: 'C', claude: 'X', openclaw: 'O', other: '?' } as const;

export function Worker({ worker }: { worker: WorkerData }) {
  return <span className={`worker worker--${worker.tool} worker--${worker.state}`} aria-label={`${worker.tool} worker, ${worker.state}`} title={worker.title ?? `${worker.tool} worker`}>{TOOL_MARK[worker.tool]}</span>;
}

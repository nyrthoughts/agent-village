import type { DerivedTask } from '../../server/truth/derive.js';
import { sortByAttention } from '../../shared/attention.js';

export function animatedTaskIds(tasks: readonly DerivedTask[], budget = 3): Set<string> {
  const candidates = tasks.filter((task) =>
    task.effectiveStatus === 'blocked' ||
    task.effectiveStatus === 'awaiting_review' ||
    task.effectiveStatus === 'in_progress',
  );
  return new Set(sortByAttention(candidates).slice(0, Math.max(0, budget)).map((task) => task.id));
}

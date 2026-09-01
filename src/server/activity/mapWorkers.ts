import type { Worker } from '../../shared/activity.js';
import type { ActivityMapping } from '../../shared/schema.js';

export function mapWorkers(workers: readonly Worker[], mappings: readonly ActivityMapping[]): Worker[] {
  return workers.map((worker) => {
    const haystack = `${worker.id} ${worker.title ?? ''}`.toLowerCase();
    const mapping = mappings.find((candidate) =>
      haystack.includes(candidate.match.toLowerCase()),
    );
    return mapping ? { ...worker, attachedTaskId: mapping.taskId } : { ...worker };
  });
}

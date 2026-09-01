import { describe, expect, it } from 'vitest';
import type { DerivedTask } from '../../server/truth/derive.js';
import { animatedTaskIds } from './animations.js';
import { orderedTasks } from './layout.js';

function task(id: string, effectiveStatus: DerivedTask['effectiveStatus']): DerivedTask {
  return { id, title: id, effectiveStatus, warnings: [], roof: false, progress: { stage: 'foundation', stageIndex: 1, verified: 0, total: 1, remaining: 1 }, subtasks: [] };
}

describe('scene layout', () => {
  it('orders stable attention states before resting work', () => {
    expect(orderedTasks([
      task('z', 'verified'), task('c', 'in_progress'), task('a', 'blocked'), task('b', 'blocked'),
    ]).map((item) => item.id)).toEqual(['a', 'b', 'c', 'z']);
  });

  it('animates at most three attention-demanding tasks', () => {
    const ids = animatedTaskIds([
      task('a', 'blocked'), task('b', 'blocked'), task('c', 'awaiting_review'), task('d', 'in_progress'), task('e', 'planned'),
    ]);
    expect([...ids]).toEqual(['a', 'b', 'c']);
  });
});

import { describe, expect, it } from 'vitest';
import { mapWorkers } from './mapWorkers.js';

describe('mapWorkers', () => {
  it('matches only explicit case-insensitive substrings and leaves others unassigned', () => {
    const workers = mapWorkers(
      [
        { id: 'one', tool: 'codex', state: 'working', title: 'ATLAS CONTOURS', lastActivityAt: '2026-08-31T15:00:00.000Z' },
        { id: 'two', tool: 'claude', state: 'waiting', title: 'Unrelated work', lastActivityAt: '2026-08-31T15:00:00.000Z' },
      ],
      [{ match: 'atlas contours', taskId: 'atlas-contours' }],
    );
    expect(workers[0]!.attachedTaskId).toBe('atlas-contours');
    expect(workers[1]!.attachedTaskId).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { ACTIVITY_STATUSES, EVIDENCE_TYPES, STATUSES } from './statuses.js';

describe('closed status vocabularies', () => {
  it('exposes the exact five progress statuses', () => {
    expect(STATUSES).toEqual([
      'planned',
      'in_progress',
      'awaiting_review',
      'blocked',
      'verified',
    ]);
  });

  it('exposes the exact six evidence types', () => {
    expect(EVIDENCE_TYPES).toEqual([
      'test',
      'commit',
      'pr_merged',
      'deployed',
      'observed',
      'human_review',
    ]);
  });

  it('exposes the exact four activity snapshot statuses', () => {
    expect(ACTIVITY_STATUSES).toEqual(['live', 'demo', 'degraded', 'absent']);
  });
});

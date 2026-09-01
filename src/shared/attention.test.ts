import { describe, expect, it } from 'vitest';
import { attentionScore, sortByAttention } from './attention.js';

describe('attention', () => {
  it('scores statuses from most to least attention-demanding', () => {
    expect(attentionScore('blocked')).toBeGreaterThan(attentionScore('awaiting_review'));
    expect(attentionScore('awaiting_review')).toBeGreaterThan(attentionScore('in_progress'));
    expect(attentionScore('in_progress')).toBeGreaterThan(attentionScore('planned'));
    expect(attentionScore('planned')).toBeGreaterThan(attentionScore('verified'));
  });

  it('sorts by attention with a stable id tie-break', () => {
    const items = [
      { id: 'b-verified', effectiveStatus: 'verified' as const },
      { id: 'z-blocked', effectiveStatus: 'blocked' as const },
      { id: 'a-blocked', effectiveStatus: 'blocked' as const },
      { id: 'm-review', effectiveStatus: 'awaiting_review' as const },
    ];
    const sorted = sortByAttention(items);
    expect(sorted.map((i) => i.id)).toEqual([
      'a-blocked',
      'z-blocked',
      'm-review',
      'b-verified',
    ]);
    // The input array is not mutated.
    expect(items[0]!.id).toBe('b-verified');
  });
});

import { describe, expect, it } from 'vitest';
import { verifyHumanReview } from './humanReview.js';

describe('verifyHumanReview', () => {
  it('treats an approved review as verified', () => {
    expect(verifyHumanReview({ reviewer: 'grace', state: 'approved' })).toBe('verified');
  });

  it('treats a pending review as pending, never as proof', () => {
    expect(verifyHumanReview({ reviewer: 'grace', state: 'pending' })).toBe('pending');
  });

  it('treats any other state as invalid', () => {
    expect(
      verifyHumanReview({ reviewer: 'grace', state: 'rubber-stamped' as never }),
    ).toBe('invalid');
  });
});

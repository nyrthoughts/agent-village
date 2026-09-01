import type { Status } from './statuses.js';

// Higher score = demands attention sooner. Verified work rests at zero.
export const ATTENTION_RANK: Record<Status, number> = {
  blocked: 4,
  awaiting_review: 3,
  in_progress: 2,
  planned: 1,
  verified: 0,
};

export function attentionScore(status: Status): number {
  return ATTENTION_RANK[status];
}

export interface AttentionItem {
  id: string;
  effectiveStatus: Status;
}

export function sortByAttention<T extends AttentionItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const byScore = attentionScore(b.effectiveStatus) - attentionScore(a.effectiveStatus);
    return byScore !== 0 ? byScore : a.id.localeCompare(b.id);
  });
}

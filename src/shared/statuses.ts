export const STATUSES = [
  'planned',
  'in_progress',
  'awaiting_review',
  'blocked',
  'verified',
] as const;

export type Status = (typeof STATUSES)[number];

export const EVIDENCE_TYPES = [
  'test',
  'commit',
  'pr_merged',
  'deployed',
  'observed',
  'human_review',
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const ACTIVITY_STATUSES = ['live', 'demo', 'degraded', 'absent'] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

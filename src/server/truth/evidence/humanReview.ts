import type { EvidenceVerdict } from '../derive.js';

export interface HumanReviewEvidenceInput {
  reviewer: string;
  state: 'approved' | 'pending';
}

export function verifyHumanReview(evidence: HumanReviewEvidenceInput): EvidenceVerdict {
  switch (evidence.state) {
    case 'approved':
      return 'verified';
    case 'pending':
      return 'pending';
    default:
      return 'invalid';
  }
}

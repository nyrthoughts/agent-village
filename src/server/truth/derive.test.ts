import { describe, expect, it } from 'vitest';
import type { Task } from '../../shared/schema.js';
import { deriveProject, deriveTask, deriveWorkspace, type EvidenceVerdict } from './derive.js';

function task(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'Task',
    subtasks: [],
    evidence: [],
    ...overrides,
  };
}

const verifiedCommit = { type: 'commit', repo: 'repos/demo', sha: 'a1b2c3d' } as const;
const pendingReview = { type: 'human_review', reviewer: 'grace', state: 'pending' } as const;

function verdicts(id: string, list: EvidenceVerdict[]): Record<string, EvidenceVerdict[]> {
  return { [id]: list };
}

describe('deriveTask', () => {
  it('downgrades a verified claim without verified evidence to in_progress with unproven_claim', () => {
    const derived = deriveTask(task({ status: 'verified' }), {});
    expect(derived.effectiveStatus).toBe('in_progress');
    expect(derived.warnings).toContain('unproven_claim');
  });

  it('keeps a verified claim backed by verified evidence', () => {
    const derived = deriveTask(
      task({ status: 'verified', evidence: [verifiedCommit] }),
      verdicts('t1', ['verified']),
    );
    expect(derived.effectiveStatus).toBe('verified');
    expect(derived.warnings).toEqual([]);
  });

  it('treats a pending human review as supporting awaiting_review, not verified', () => {
    const awaiting = deriveTask(
      task({ status: 'awaiting_review', evidence: [pendingReview] }),
      verdicts('t1', ['pending']),
    );
    expect(awaiting.effectiveStatus).toBe('awaiting_review');
    expect(awaiting.warnings).toEqual([]);

    const claimed = deriveTask(
      task({ status: 'verified', evidence: [pendingReview] }),
      verdicts('t1', ['pending']),
    );
    expect(claimed.effectiveStatus).toBe('awaiting_review');
    expect(claimed.warnings).toEqual([]);
  });

  it('flags invalid evidence and refuses it as proof', () => {
    const derived = deriveTask(
      task({ status: 'verified', evidence: [verifiedCommit] }),
      verdicts('t1', ['invalid']),
    );
    expect(derived.effectiveStatus).toBe('in_progress');
    expect(derived.warnings).toContain('invalid_evidence');
    expect(derived.warnings).toContain('unproven_claim');
  });

  it('moves a planned task with invalid evidence back to in_progress', () => {
    const derived = deriveTask(
      task({ status: 'planned', evidence: [verifiedCommit] }),
      verdicts('t1', ['invalid']),
    );
    expect(derived.effectiveStatus).toBe('in_progress');
    expect(derived.warnings).toEqual(['invalid_evidence']);
  });

  it('lets a blocked subtask dominate a proven verified task', () => {
    const derived = deriveTask(
      task({
        status: 'verified',
        evidence: [verifiedCommit],
        subtasks: [
          { id: 's1', title: 'Floor', status: 'blocked', evidence: [] },
        ],
      }),
      verdicts('t1', ['verified']),
    );
    expect(derived.effectiveStatus).toBe('blocked');
    expect(derived.roof).toBe(false);
  });

  it('raises the roof only when the task and every subtask are effectively verified', () => {
    const fullyVerified = deriveTask(
      task({
        status: 'verified',
        evidence: [verifiedCommit],
        subtasks: [
          { id: 's1', title: 'Floor', status: 'verified', evidence: [verifiedCommit] },
        ],
      }),
      { t1: ['verified'], s1: ['verified'] },
    );
    expect(fullyVerified.effectiveStatus).toBe('verified');
    expect(fullyVerified.roof).toBe(true);

    const partial = deriveTask(
      task({
        status: 'verified',
        evidence: [verifiedCommit],
        subtasks: [{ id: 's1', title: 'Floor', status: 'in_progress', evidence: [] }],
      }),
      verdicts('t1', ['verified']),
    );
    expect(partial.effectiveStatus).not.toBe('verified');
    expect(partial.roof).toBe(false);
  });

  it('rolls verified subtasks into an implicit parent task', () => {
    const derived = deriveTask(
      task({
        subtasks: [
          { id: 's1', title: 'Floor', status: 'verified', evidence: [verifiedCommit] },
        ],
      }),
      verdicts('s1', ['verified']),
    );
    expect(derived.effectiveStatus).toBe('verified');
    expect(derived.roof).toBe(true);
  });

  it('keeps an explicit parent state in the rollup', () => {
    const derived = deriveTask(
      task({
        status: 'in_progress',
        subtasks: [
          { id: 's1', title: 'Floor', status: 'verified', evidence: [verifiedCommit] },
        ],
      }),
      verdicts('s1', ['verified']),
    );
    expect(derived.effectiveStatus).toBe('in_progress');
    expect(derived.roof).toBe(false);
  });

  it('derives six construction stages from verified leaves and the roof gate', () => {
    expect(deriveTask(task({ status: 'planned' }), {}).progress).toMatchObject({
      stage: 'lot',
      stageIndex: 0,
      verified: 0,
      total: 1,
      remaining: 1,
    });
    expect(deriveTask(task({ status: 'in_progress' }), {}).progress.stage).toBe('foundation');

    const halfBuilt = deriveTask(
      task({
        status: 'in_progress',
        subtasks: [
          { id: 's1', title: 'Foundation', status: 'verified', evidence: [verifiedCommit] },
          { id: 's2', title: 'Roof', status: 'planned', evidence: [] },
        ],
      }),
      verdicts('s1', ['verified']),
    );
    expect(halfBuilt.progress).toMatchObject({
      stage: 'walls',
      stageIndex: 3,
      verified: 1,
      total: 2,
      remaining: 1,
    });

    const allLeavesVerified = deriveTask(
      task({
        status: 'in_progress',
        subtasks: [
          { id: 's1', title: 'Foundation', status: 'verified', evidence: [verifiedCommit] },
          { id: 's2', title: 'Roof', status: 'verified', evidence: [verifiedCommit] },
        ],
      }),
      { s1: ['verified'], s2: ['verified'] },
    );
    expect(allLeavesVerified.progress.stage).toBe('roof');
    expect(allLeavesVerified.roof).toBe(false);

    const complete = deriveTask(
      task({ status: 'verified', evidence: [verifiedCommit] }),
      verdicts('t1', ['verified']),
    );
    expect(complete.progress.stage).toBe('complete');
    expect(complete.progress.stageIndex).toBe(5);
  });
});

describe('deriveProject', () => {
  it('rolls the most attention-demanding status up through features and standalone tasks', () => {
    const derived = deriveProject(
      {
        id: 'p1',
        name: 'P1',
        objective: 'Test rollup',
        features: [
          {
            id: 'f1',
            title: 'F1',
            tasks: [
              task({ id: 't1', status: 'verified', evidence: [verifiedCommit] }),
              task({ id: 't2', status: 'blocked' }),
            ],
          },
        ],
        tasks: [task({ id: 't3', status: 'in_progress' })],
      },
      verdicts('t1', ['verified']),
    );
    expect(derived.features[0]!.effectiveStatus).toBe('blocked');
    expect(derived.effectiveStatus).toBe('blocked');
  });

  it('rolls verified work and remaining work up without inventing progress', () => {
    const derived = deriveWorkspace(
      {
        version: 1,
        name: 'Village',
        projects: [
          {
            id: 'p1',
            name: 'P1',
            objective: 'Measure truth',
            features: [],
            tasks: [
              task({ id: 'done', status: 'verified', evidence: [verifiedCommit] }),
              task({ id: 'todo', status: 'in_progress' }),
            ],
          },
        ],
      },
      verdicts('done', ['verified']),
    );

    expect(derived.progress).toEqual({ verified: 1, total: 2, remaining: 1 });
    expect(derived.projects[0]!.progress).toEqual({ verified: 1, total: 2, remaining: 1 });
  });
});

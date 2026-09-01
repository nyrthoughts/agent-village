import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Evidence, Workspace } from '../../../shared/schema.js';
import { verifyEvidence, verifyWorkspaceEvidence } from './verify.js';

const yamlDir = mkdtempSync(join(tmpdir(), 'agent-village-verify-'));
mkdirSync(join(yamlDir, 'repos', 'demo'), { recursive: true });

afterAll(() => {
  rmSync(yamlDir, { recursive: true, force: true });
});

describe('verifyEvidence', () => {
  it('returns not_checked_v1 for the four represented-but-unexecuted types', async () => {
    const referenced: Evidence[] = [
      { type: 'test', ref: 'src/thing.test.ts' },
      { type: 'pr_merged', ref: '42' },
      { type: 'deployed', ref: 'v1.0.0' },
      { type: 'observed', ref: 'dashboard screenshot' },
    ];
    for (const evidence of referenced) {
      await expect(verifyEvidence(evidence, yamlDir)).resolves.toBe('not_checked_v1');
    }
  });

  it('dispatches human reviews to the pure review verifier', async () => {
    await expect(
      verifyEvidence({ type: 'human_review', reviewer: 'grace', state: 'approved' }, yamlDir),
    ).resolves.toBe('verified');
    await expect(
      verifyEvidence({ type: 'human_review', reviewer: 'grace', state: 'pending' }, yamlDir),
    ).resolves.toBe('pending');
  });

  it('dispatches commits to the git verifier', async () => {
    const execGit = vi.fn().mockResolvedValue(undefined);
    await expect(
      verifyEvidence({ type: 'commit', repo: 'repos/demo', sha: 'a1b2c3d' }, yamlDir, execGit),
    ).resolves.toBe('verified');
    expect(execGit).toHaveBeenCalledTimes(1);
  });
});

describe('verifyWorkspaceEvidence', () => {
  it('collects verdicts per task and subtask id', async () => {
    const workspace: Workspace = {
      version: 1,
      name: 'Test',
      projects: [
        {
          id: 'p1',
          name: 'P1',
          objective: 'Verify collection',
          features: [
            {
              id: 'f1',
              title: 'F1',
              tasks: [
                {
                  id: 't1',
                  title: 'T1',
                  subtasks: [
                    {
                      id: 's1',
                      title: 'S1',
                      evidence: [{ type: 'test', ref: 'unit' }],
                    },
                  ],
                  evidence: [
                    { type: 'human_review', reviewer: 'grace', state: 'approved' },
                    { type: 'human_review', reviewer: 'ada', state: 'pending' },
                  ],
                },
              ],
            },
          ],
          tasks: [
            {
              id: 't2',
              title: 'T2',
              subtasks: [],
              evidence: [{ type: 'commit', repo: 'repos/demo', sha: 'not a sha' }],
            },
          ],
        },
      ],
    };

    const verdicts = await verifyWorkspaceEvidence(workspace, yamlDir);
    expect(verdicts).toEqual({
      t1: ['verified', 'pending'],
      s1: ['not_checked_v1'],
      t2: ['invalid'],
    });
  });

  it('omits nodes without evidence', async () => {
    const workspace: Workspace = {
      version: 1,
      name: 'Test',
      projects: [
        {
          id: 'p1',
          name: 'P1',
          objective: 'Nothing to verify',
          features: [],
          tasks: [{ id: 't1', title: 'T1', subtasks: [], evidence: [] }],
        },
      ],
    };
    await expect(verifyWorkspaceEvidence(workspace, yamlDir)).resolves.toEqual({});
  });
});

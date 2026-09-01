import type { Evidence, Task, Workspace } from '../../../shared/schema.js';
import type { EvidenceVerdict, VerdictsById } from '../derive.js';
import { verifyCommit, type ExecGit } from './commit.js';
import { verifyHumanReview } from './humanReview.js';

export async function verifyEvidence(
  evidence: Evidence,
  yamlDir: string,
  execGit?: ExecGit,
): Promise<EvidenceVerdict> {
  switch (evidence.type) {
    case 'commit':
      return verifyCommit(evidence, yamlDir, execGit);
    case 'human_review':
      return verifyHumanReview(evidence);
    // test, pr_merged, deployed and observed are represented but never
    // executed in V1, so they can never prove anything.
    default:
      return 'not_checked_v1';
  }
}

export async function verifyWorkspaceEvidence(
  workspace: Workspace,
  yamlDir: string,
  execGit?: ExecGit,
): Promise<VerdictsById> {
  const verdicts: VerdictsById = {};

  const collect = async (id: string, evidence: Evidence[]) => {
    if (evidence.length === 0) {
      return;
    }
    verdicts[id] = await Promise.all(
      evidence.map((item) => verifyEvidence(item, yamlDir, execGit)),
    );
  };

  const collectTask = async (task: Task) => {
    await collect(task.id, task.evidence);
    for (const subtask of task.subtasks) {
      await collect(subtask.id, subtask.evidence);
    }
  };

  for (const project of workspace.projects) {
    for (const feature of project.features) {
      for (const task of feature.tasks) {
        await collectTask(task);
      }
    }
    for (const task of project.tasks) {
      await collectTask(task);
    }
  }

  return verdicts;
}

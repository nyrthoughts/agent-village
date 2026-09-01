import { attentionScore } from '../../shared/attention.js';
import type {
  Evidence,
  Feature,
  Project,
  Subtask,
  Task,
  Workspace,
} from '../../shared/schema.js';
import type { Status } from '../../shared/statuses.js';

// Verdicts are produced by the evidence verifiers (Task 04) and passed in so
// derivation stays pure. Anything not explicitly verified proves nothing.
export type EvidenceVerdict = 'verified' | 'invalid' | 'pending' | 'not_checked_v1';

export type VerdictsById = Record<string, EvidenceVerdict[]>;

export type Warning = 'unproven_claim' | 'invalid_evidence';
export interface DerivedEvidence { type: Evidence['type']; verdict: EvidenceVerdict; note?: string }

export interface DerivedSubtask {
  id: string;
  title: string;
  declaredStatus?: Status;
  effectiveStatus: Status;
  warnings: Warning[];
  evidence?: DerivedEvidence[];
}

export interface DerivedTask extends DerivedSubtask {
  owner?: string;
  blockedReason?: string;
  nextAction?: string;
  resumeHint?: string;
  roof: boolean;
  subtasks: DerivedSubtask[];
}

export interface DerivedFeature {
  id: string;
  title: string;
  effectiveStatus: Status;
  tasks: DerivedTask[];
}

export interface DerivedProject {
  id: string;
  name: string;
  objective: string;
  effectiveStatus: Status;
  features: DerivedFeature[];
  tasks: DerivedTask[];
}

export interface DerivedWorkspace {
  version: 1;
  name: string;
  projects: DerivedProject[];
}

function dominant(statuses: readonly Status[]): Status {
  // An empty container has built nothing, so it is planned, not verified.
  if (statuses.length === 0) {
    return 'planned';
  }
  return statuses.reduce((acc, status) =>
    attentionScore(status) > attentionScore(acc) ? status : acc,
  );
}

function deriveLeaf(
  node: Pick<Subtask, 'id' | 'title' | 'status' | 'evidence'>,
  verdicts: EvidenceVerdict[],
): DerivedSubtask {
  const declared = node.status ?? 'planned';
  const warnings: Warning[] = [];
  const hasInvalidEvidence = verdicts.includes('invalid');
  const hasPendingReview = verdicts.includes('pending');
  const hasVerifiedEvidence = verdicts.includes('verified');

  if (hasInvalidEvidence) {
    warnings.push('invalid_evidence');
  }

  let effective: Status = declared;
  if (declared !== 'blocked' && hasInvalidEvidence) {
    effective = 'in_progress';
    if (declared === 'verified') {
      warnings.push('unproven_claim');
    }
  } else if (declared !== 'blocked' && hasPendingReview) {
    effective = 'awaiting_review';
  } else if (declared === 'verified' && !hasVerifiedEvidence) {
    effective = 'in_progress';
    warnings.push('unproven_claim');
  }

  return {
    id: node.id,
    title: node.title,
    declaredStatus: node.status,
    effectiveStatus: effective,
    warnings,
    evidence: node.evidence.map((item, index) => ({
      type: item.type,
      verdict: verdicts[index] ?? 'not_checked_v1',
      ...('note' in item && item.note ? { note: item.note } : {}),
    })),
  };
}

export function deriveSubtask(subtask: Subtask, verdictsById: VerdictsById): DerivedSubtask {
  return deriveLeaf(subtask, verdictsById[subtask.id] ?? []);
}

export function deriveTask(task: Task, verdictsById: VerdictsById): DerivedTask {
  const own = deriveLeaf(task, verdictsById[task.id] ?? []);
  const subtasks = task.subtasks.map((subtask) => deriveSubtask(subtask, verdictsById));
  const ownContributes =
    task.status !== undefined || task.evidence.length > 0 || subtasks.length === 0;
  const effectiveStatus = dominant([
    ...(ownContributes ? [own.effectiveStatus] : []),
    ...subtasks.map((s) => s.effectiveStatus),
  ]);

  return {
    ...own,
    owner: task.owner,
    blockedReason: task.blockedReason,
    nextAction: task.nextAction,
    resumeHint: task.resumeHint,
    effectiveStatus,
    roof: effectiveStatus === 'verified',
    subtasks,
  };
}

export function deriveFeature(feature: Feature, verdictsById: VerdictsById): DerivedFeature {
  const tasks = feature.tasks.map((task) => deriveTask(task, verdictsById));
  return {
    id: feature.id,
    title: feature.title,
    effectiveStatus: dominant(tasks.map((t) => t.effectiveStatus)),
    tasks,
  };
}

export function deriveProject(project: Project, verdictsById: VerdictsById): DerivedProject {
  const features = project.features.map((feature) => deriveFeature(feature, verdictsById));
  const tasks = project.tasks.map((task) => deriveTask(task, verdictsById));
  return {
    id: project.id,
    name: project.name,
    objective: project.objective,
    effectiveStatus: dominant([
      ...features.map((f) => f.effectiveStatus),
      ...tasks.map((t) => t.effectiveStatus),
    ]),
    features,
    tasks,
  };
}

export function deriveWorkspace(workspace: Workspace, verdictsById: VerdictsById): DerivedWorkspace {
  return {
    version: workspace.version,
    name: workspace.name,
    projects: workspace.projects.map((project) => deriveProject(project, verdictsById)),
  };
}

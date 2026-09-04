import { attentionScore } from '../../shared/attention.js';
import type {
  Evidence,
  Feature,
  Project,
  Subtask,
  Task,
  Workspace,
} from '../../shared/schema.js';
import { CONSTRUCTION_STAGES, type ConstructionStage, type Status } from '../../shared/statuses.js';

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
  progress: TaskProgress;
  subtasks: DerivedSubtask[];
}

export interface ProgressRollup {
  verified: number;
  total: number;
  remaining: number;
}

export interface TaskProgress extends ProgressRollup {
  stage: ConstructionStage;
  stageIndex: number;
}

export interface DerivedFeature {
  id: string;
  title: string;
  effectiveStatus: Status;
  progress: ProgressRollup;
  tasks: DerivedTask[];
}

export interface DerivedProject {
  id: string;
  name: string;
  objective: string;
  effectiveStatus: Status;
  progress: ProgressRollup;
  features: DerivedFeature[];
  tasks: DerivedTask[];
}

export interface DerivedWorkspace {
  version: 1;
  name: string;
  progress: ProgressRollup;
  projects: DerivedProject[];
}

function rollup(progress: readonly ProgressRollup[]): ProgressRollup {
  const verified = progress.reduce((sum, item) => sum + item.verified, 0);
  const total = progress.reduce((sum, item) => sum + item.total, 0);
  return { verified, total, remaining: Math.max(0, total - verified) };
}

function taskProgress(
  effectiveStatus: Status,
  roof: boolean,
  subtasks: readonly DerivedSubtask[],
): TaskProgress {
  const leaves = subtasks.length > 0 ? subtasks : [{ effectiveStatus }];
  const total = leaves.length;
  const verified = leaves.filter((leaf) => leaf.effectiveStatus === 'verified').length;
  const stageIndex = roof
    ? 5
    : verified === 0
      ? effectiveStatus === 'planned' ? 0 : 1
      : 1 + Math.min(3, Math.ceil((verified * 3) / total));

  return {
    stage: CONSTRUCTION_STAGES[stageIndex]!,
    stageIndex,
    verified,
    total,
    remaining: total - verified,
  };
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
  const roof = effectiveStatus === 'verified';

  return {
    ...own,
    owner: task.owner,
    blockedReason: task.blockedReason,
    nextAction: task.nextAction,
    resumeHint: task.resumeHint,
    effectiveStatus,
    roof,
    progress: taskProgress(effectiveStatus, roof, subtasks),
    subtasks,
  };
}

export function deriveFeature(feature: Feature, verdictsById: VerdictsById): DerivedFeature {
  const tasks = feature.tasks.map((task) => deriveTask(task, verdictsById));
  return {
    id: feature.id,
    title: feature.title,
    effectiveStatus: dominant(tasks.map((t) => t.effectiveStatus)),
    progress: rollup(tasks.map((task) => task.progress)),
    tasks,
  };
}

export function deriveProject(project: Project, verdictsById: VerdictsById): DerivedProject {
  const features = project.features.map((feature) => deriveFeature(feature, verdictsById));
  const tasks = project.tasks.map((task) => deriveTask(task, verdictsById));
  const progress = rollup([
    ...features.map((feature) => feature.progress),
    ...tasks.map((task) => task.progress),
  ]);
  return {
    id: project.id,
    name: project.name,
    objective: project.objective,
    effectiveStatus: dominant([
      ...features.map((f) => f.effectiveStatus),
      ...tasks.map((t) => t.effectiveStatus),
    ]),
    progress,
    features,
    tasks,
  };
}

export function deriveWorkspace(workspace: Workspace, verdictsById: VerdictsById): DerivedWorkspace {
  const projects = workspace.projects.map((project) => deriveProject(project, verdictsById));
  return {
    version: workspace.version,
    name: workspace.name,
    progress: rollup(projects.map((project) => project.progress)),
    projects,
  };
}

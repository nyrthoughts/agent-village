import type { DerivedProject, DerivedTask } from '../server/truth/derive.js';

export const milestoneTaskId = (projectId: string, milestoneId: string) => `${projectId}:${milestoneId}`;

/** A view of the private ledger, not new tasks or inferred agent assignments. */
export function projectDistrict(project: DerivedProject): DerivedProject {
  const parcels: DerivedTask[] = (project.plan?.milestones ?? []).map((milestone) => ({
    id: milestoneTaskId(project.id, milestone.id),
    title: milestone.title,
    effectiveStatus: milestone.validated ? 'verified' : 'planned',
    warnings: [],
    roof: milestone.validated,
    progress: { total: 1, verified: Number(milestone.validated), remaining: Number(!milestone.validated),
      stage: milestone.validated ? 'complete' : 'lot', stageIndex: milestone.validated ? 5 : 0 },
    subtasks: [],
    evidence: milestone.validated ? [{ type: milestone.validatedBy === 'owner' ? 'human_review' : 'observed', verdict: 'verified', note: milestone.note }] : [],
  }));
  // The server's common house is the aggregate. Do not add its total to the parcels.
  return { ...project, features: [], tasks: [...project.tasks.filter((task) => task.id === project.id), ...parcels] };
}

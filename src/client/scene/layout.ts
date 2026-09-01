import type { DerivedFeature, DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import { sortByAttention } from '../../shared/attention.js';

export function orderedTasks(tasks: readonly DerivedTask[]): DerivedTask[] {
  return sortByAttention(tasks);
}

export function orderedFeatures(features: readonly DerivedFeature[]): DerivedFeature[] {
  return sortByAttention(features);
}

export function orderedProjects(projects: readonly DerivedProject[]): DerivedProject[] {
  return sortByAttention(projects);
}

export function allTasks(workspace: DerivedWorkspace): DerivedTask[] {
  return workspace.projects.flatMap((project) => [
    ...project.features.flatMap((feature) => feature.tasks),
    ...project.tasks,
  ]);
}

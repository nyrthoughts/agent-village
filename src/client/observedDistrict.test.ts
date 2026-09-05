import { expect, it } from 'vitest';
import { observedVillage, projectId } from '../server/activity/projectObserver.js';
import type { ProjectPlan } from '../shared/projectPlan.js';
import { milestoneTaskId, projectDistrict } from './observedDistrict.js';

const at = '2026-09-05T12:00:00Z';
const plan: ProjectPlan = {
  projectName: 'Harbor', objective: 'A usable harbor', revision: 1, updatedAt: at,
  milestones: [
    { id: 'dock', title: 'Open the dock', validated: true, note: 'Checked the route', validatedAt: at, validatedBy: 'owner' },
    { id: 'garden', title: 'Open the garden', validated: false, note: '' },
  ],
};
function project(key = 'harbor', value = plan) {
  return observedVillage([], [], [], { [projectId(key)]: value }).projects[0]!;
}

it('keeps an aggregate common house and gives each explicit milestone its own parcel', () => {
  const source = project();
  const before = JSON.stringify(source);
  const district = projectDistrict(source);
  expect(district.tasks.map((t) => t.id)).toEqual([source.id, milestoneTaskId(source.id, 'dock'), milestoneTaskId(source.id, 'garden')]);
  expect(district.tasks[0]!.progress).toEqual(source.tasks[0]!.progress);
  expect(district.tasks[1]).toMatchObject({ roof: true, effectiveStatus: 'verified', progress: { stage: 'complete', verified: 1, total: 1, remaining: 0 } });
  expect(district.tasks[2]).toMatchObject({ roof: false, effectiveStatus: 'planned', progress: { stage: 'lot', verified: 0, total: 1, remaining: 1 } });
  expect(district.tasks[1]!.evidence).toEqual([{ type: 'human_review', verdict: 'verified', note: 'Checked the route' }]);
  expect(district.progress).toEqual(source.progress); // Common-house rollup is not counted twice.
  expect(JSON.stringify(source)).toBe(before);
});

it('namespaces homonymous milestones across projects and keeps all parcel IDs stable on reopening', () => {
  const first = projectDistrict(project());
  const second = projectDistrict(project('other'));
  expect(first.tasks[1]!.id).not.toBe(second.tasks[1]!.id);
  const reopened = projectDistrict(project('harbor', { ...plan, milestones: plan.milestones.map((m) => ({ ...m, validated: false, validatedAt: undefined, validatedBy: undefined })) }));
  expect(reopened.tasks.map((t) => t.id)).toEqual(first.tasks.map((t) => t.id));
  expect(reopened.tasks[1]!.progress.stage).toBe('lot');
  expect(reopened.tasks[2]).toEqual(first.tasks[2]);
});

it('does not turn sessions, activity or a missing plan into milestone buildings', () => {
  const source = observedVillage([{ id: 'lead', tool: 'codex', state: 'working', role: 'lead', projectKey: 'harbor', project: 'Harbor', history: [], lastActivityAt: at }], []).projects[0]!;
  const district = projectDistrict(source);
  expect(district.tasks).toHaveLength(1);
  expect(district.tasks[0]).toMatchObject({ roof: false, progress: { total: 0 } });
  expect(district.observation).toBe(source.observation);
});

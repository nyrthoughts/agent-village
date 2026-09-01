import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { DerivedSubtask, DerivedTask } from '../../server/truth/derive.js';
import type { Status } from '../../shared/statuses.js';
import { createBuildingGroup } from './buildingFactory.js';
import { buildingSpec } from './buildingSpec.js';

function subtask(id: string, effectiveStatus: Status): DerivedSubtask {
  return { id, title: id, effectiveStatus, warnings: [] };
}

function task(
  effectiveStatus: Status,
  subtasks: DerivedSubtask[] = [],
): DerivedTask {
  return {
    id: `task-${effectiveStatus}`,
    title: effectiveStatus,
    effectiveStatus,
    warnings: [],
    roof: effectiveStatus === 'verified',
    subtasks,
  };
}

describe('buildingSpec', () => {
  it('maps the five truth states to a volumetric construction grammar', () => {
    expect(buildingSpec(task('planned'))).toMatchObject({
      solidFloors: 0,
      frameFloors: 0,
      ghostFloors: 1,
      roof: false,
      scaffold: false,
      flag: false,
    });
    expect(buildingSpec(task('in_progress'))).toMatchObject({ frameFloors: 1, roof: false });
    expect(buildingSpec(task('blocked'))).toMatchObject({ frameFloors: 1, scaffold: true });
    expect(buildingSpec(task('awaiting_review'))).toMatchObject({ solidFloors: 1, flag: true });
    expect(buildingSpec(task('verified'))).toMatchObject({ solidFloors: 1, roof: true });
  });

  it('uses subtask states as floors and caps visual height at five', () => {
    const subtasks = Array.from({ length: 7 }, (_, index) => subtask(
      `floor-${index}`,
      index < 2 ? 'verified' : index < 4 ? 'in_progress' : 'planned',
    ));

    expect(buildingSpec(task('in_progress', subtasks))).toMatchObject({
      floorCount: 5,
      solidFloors: 2,
      frameFloors: 2,
      ghostFloors: 1,
    });
  });
});

describe('createBuildingGroup', () => {
  it('creates pickable named geometry for completed and attention states', () => {
    const verified = createBuildingGroup(task('verified'));
    const blocked = createBuildingGroup(task('blocked'));
    const review = createBuildingGroup(task('awaiting_review'));

    expect(verified.userData.taskId).toBe('task-verified');
    expect(verified.getObjectByName('roof')).toBeDefined();
    expect(verified.getObjectByName('door')).toBeDefined();
    expect(verified.getObjectByName('window')).toBeDefined();
    expect(verified.getObjectByName('roof-cap')).toBeDefined();
    expect(verified.getObjectByName('chimney')).toBeDefined();
    expect(verified.getObjectByName('flower-box')).toBeDefined();
    expect(verified.getObjectByName('porch')).toBeDefined();
    expect(verified.getObjectByName('roof-ridge')).toBeDefined();
    expect(blocked.getObjectByName('scaffold')).toBeDefined();
    expect(review.getObjectByName('review-flag')).toBeDefined();
    expect(verified.children.some((child) => child.userData.pickable === true)).toBe(true);
  });

  it('grows upward as floors are added', () => {
    const oneFloor = createBuildingGroup(task('verified'));
    const fourFloors = createBuildingGroup(task('verified', Array.from(
      { length: 4 },
      (_, index) => subtask(`floor-${index}`, 'verified'),
    )));

    expect(new Box3().setFromObject(fourFloors).max.y)
      .toBeGreaterThan(new Box3().setFromObject(oneFloor).max.y);
  });
});

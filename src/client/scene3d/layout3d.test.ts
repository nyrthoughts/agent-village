import { describe, expect, it } from 'vitest';
import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import { layoutVillage3d } from './layout3d.js';

function task(id: string): DerivedTask {
  return {
    id,
    title: id,
    effectiveStatus: 'planned',
    warnings: [],
    roof: false,
    subtasks: [],
  };
}

const village: DerivedWorkspace = {
  version: 1,
  name: 'Verdant Labs',
  projects: [
    {
      id: 'atlas',
      name: 'Atlas',
      objective: 'Map the valley',
      effectiveStatus: 'blocked',
      features: [
        {
          id: 'cartography',
          title: 'Cartography',
          effectiveStatus: 'in_progress',
          tasks: [task('atlas-contours'), task('atlas-observatory')],
        },
      ],
      tasks: [task('atlas-library')],
    },
    {
      id: 'beacon',
      name: 'Beacon',
      objective: 'Light the approach',
      effectiveStatus: 'in_progress',
      features: [
        {
          id: 'signal',
          title: 'Signal',
          effectiveStatus: 'in_progress',
          tasks: [task('beacon-lens')],
        },
      ],
      tasks: [],
    },
  ],
};

describe('layoutVillage3d', () => {
  it('places every project and task in one deterministic village', () => {
    const layout = layoutVillage3d(village);

    expect(layout.districts.map((district) => district.projectId)).toEqual(['atlas', 'beacon']);
    expect(layout.buildings.map((building) => building.taskId)).toEqual([
      'atlas-contours',
      'atlas-observatory',
      'atlas-library',
      'beacon-lens',
    ]);
    expect(new Set(layout.buildings.map(({ x, z }) => `${x}:${z}`)).size)
      .toBe(layout.buildings.length);
    expect(Math.abs(layout.districts[0]!.x - layout.districts[1]!.x)).toBeLessThan(30);
    expect(layout.buildings.some(({ rotationY }) => rotationY !== 0)).toBe(true);
    expect(layoutVillage3d(village)).toEqual(layout);
  });

  it('marks feature tasks with their compound and leaves standalone tasks open', () => {
    const layout = layoutVillage3d(village);

    expect(layout.buildings.find(({ taskId }) => taskId === 'atlas-contours'))
      .toMatchObject({ projectId: 'atlas', compoundId: 'cartography' });
    expect(layout.buildings.find(({ taskId }) => taskId === 'atlas-library'))
      .toMatchObject({ projectId: 'atlas', compoundId: undefined });
  });

  it('expands district bounds for larger task collections without randomness', () => {
    const expanded: DerivedWorkspace = {
      ...village,
      projects: [{
        ...village.projects[0]!,
        features: [],
        tasks: Array.from({ length: 10 }, (_, index) => task(`task-${index}`)),
      }],
    };
    const layout = layoutVillage3d(expanded);

    expect(layout.districts[0]!.depth).toBeGreaterThan(18);
    expect(layout.width).toBeGreaterThanOrEqual(layout.districts[0]!.width);
    expect(layout.depth).toBeGreaterThanOrEqual(layout.districts[0]!.depth);
  });
});

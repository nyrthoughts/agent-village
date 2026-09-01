import { describe, expect, it } from 'vitest';
import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import { layoutVillage2d } from './villageLayout2d.js';

function task(id: string): DerivedTask {
  return { id, title: id, effectiveStatus: 'planned', warnings: [], roof: false, subtasks: [] };
}

const village: DerivedWorkspace = {
  version: 1,
  name: 'Verdant Labs',
  projects: [
    {
      id: 'atlas', name: 'Atlas', objective: 'Map the valley', effectiveStatus: 'in_progress',
      features: [{ id: 'cartography', title: 'Cartography', effectiveStatus: 'in_progress', tasks: [task('atlas-contours'), task('atlas-observatory')] }],
      tasks: [task('atlas-library')],
    },
    {
      id: 'beacon', name: 'Beacon', objective: 'Light the approach', effectiveStatus: 'in_progress',
      features: [{ id: 'signal', title: 'Signal', effectiveStatus: 'in_progress', tasks: [task('beacon-lens')] }],
      tasks: [],
    },
  ],
};

describe('layoutVillage2d', () => {
  it('places projects and tasks on one deterministic tile grid', () => {
    const layout = layoutVillage2d(village);
    expect(layout.width).toBe(64);
    expect(layout.height).toBeGreaterThanOrEqual(40);
    expect(layout.zones.map(({ projectId }) => projectId)).toEqual(['atlas', 'beacon']);
    expect(layout.buildings.map(({ taskId }) => taskId)).toEqual([
      'atlas-contours', 'atlas-observatory', 'atlas-library', 'beacon-lens',
    ]);
    expect(new Set(layout.buildings.map(({ x, y }) => `${x}:${y}`)).size).toBe(layout.buildings.length);
    expect(layout.paths.length).toBeGreaterThan(2);
    expect(new Set(layout.paths.map(({ kind }) => kind))).toEqual(new Set(['vertical', 'horizontal', 'square', 'spur']));
    expect(layout.paths.some(({ height }) => height === layout.height)).toBe(false);
    expect(layout.landmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'pond' }),
      expect.objectContaining({ kind: 'cliff' }),
    ]));
    expect(layoutVillage2d(village)).toEqual(layout);
  });

  it('preserves feature compounds and standalone project plots', () => {
    const layout = layoutVillage2d(village);
    expect(layout.buildings.find(({ taskId }) => taskId === 'atlas-contours'))
      .toMatchObject({ projectId: 'atlas', compoundId: 'cartography' });
    expect(layout.buildings.find(({ taskId }) => taskId === 'atlas-library'))
      .toMatchObject({ projectId: 'atlas', compoundId: undefined });
  });

  it('expands vertically for larger villages without overlapping plots', () => {
    const expanded: DerivedWorkspace = {
      ...village,
      projects: [{ ...village.projects[0]!, features: [], tasks: Array.from({ length: 10 }, (_, index) => task(`task-${index}`)) }],
    };
    const layout = layoutVillage2d(expanded);
    expect(layout.height).toBeGreaterThan(40);
    expect(new Set(layout.buildings.map(({ x, y }) => `${x}:${y}`)).size).toBe(10);
  });
});

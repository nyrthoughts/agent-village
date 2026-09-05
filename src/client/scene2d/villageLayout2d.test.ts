import { describe, expect, it } from 'vitest';
import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import { layoutVillage2d } from './villageLayout2d.js';
import { canWalk, findVillagePath, navigationFor } from './villagePathfinding.js';

function task(id: string): DerivedTask {
  return { id, title: id, effectiveStatus: 'planned', warnings: [], roof: false, progress: { stage: 'lot', stageIndex: 0, verified: 0, total: 1, remaining: 1 }, subtasks: [] };
}

const village: DerivedWorkspace = {
  version: 1,
  name: 'Verdant Labs',
  progress: { verified: 0, total: 4, remaining: 4 },
  projects: [
    {
      id: 'atlas', name: 'Atlas', objective: 'Map the valley', effectiveStatus: 'in_progress', progress: { verified: 0, total: 3, remaining: 3 },
      features: [{ id: 'cartography', title: 'Cartography', effectiveStatus: 'in_progress', progress: { verified: 0, total: 2, remaining: 2 }, tasks: [task('atlas-contours'), task('atlas-observatory')] }],
      tasks: [task('atlas-library')],
    },
    {
      id: 'beacon', name: 'Beacon', objective: 'Light the approach', effectiveStatus: 'in_progress', progress: { verified: 0, total: 1, remaining: 1 },
      features: [{ id: 'signal', title: 'Signal', effectiveStatus: 'in_progress', progress: { verified: 0, total: 1, remaining: 1 }, tasks: [task('beacon-lens')] }],
      tasks: [],
    },
  ],
};

describe('layoutVillage2d', () => {
  function district(milestones: number): DerivedWorkspace {
    return { ...village, observation: { fetchedAt: '2026-09-05T12:00:00Z', errors: [], historyWindow: '', focusProjects: [] }, projects: [{ ...village.projects[0]!, features: [], tasks: [task('atlas'), ...Array.from({ length: milestones }, (_, index) => task(`atlas:milestone-${index}`))] }] };
  }

  it.each([0, 1, 12])('lays out a common house and %i milestone sites with connected, unobstructed doors', (count) => {
    const layout = layoutVillage2d(district(count), true);
    expect(layout.buildings).toHaveLength(count + 1);
    expect(layout.width).toBe(48);
    const navigation = navigationFor(layout);
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    for (const building of layout.buildings) {
      expect(building.door).toEqual({ x: building.x + 3, y: building.y + 6 });
      expect(canWalk(navigation, building.door!)).toBe(true);
      expect(findVillagePath(navigation, layout.entrance, building.door!)).not.toBeNull();
      const silhouette = { x: building.x, y: building.y - 2, width: 7, height: 8 };
      const label = { x: building.x, y: building.y + 7, width: 7, height: 2 };
      expect(silhouette.y).toBeGreaterThanOrEqual(0);
      expect(label.y + label.height).toBeLessThan(layout.height);
      for (const other of layout.buildings.filter((plot) => plot.taskId !== building.taskId)) {
        expect(overlaps(silhouette, { x: other.x, y: other.y - 2, width: 7, height: 11 })).toBe(false);
        expect(overlaps(label, { x: other.x, y: other.y - 2, width: 7, height: 11 })).toBe(false);
      }
      for (const obstacle of layout.obstacles!.filter((obstacle) => obstacle.kind !== 'building')) {
        expect(overlaps(silhouette, obstacle)).toBe(false);
        expect(overlaps(label, obstacle)).toBe(false);
      }
      expect(layout.paths.some((path) => overlaps({ x: building.x, y: building.y, width: 7, height: 6 }, path))).toBe(false);
    }
  });

  it('keeps plot coordinates through validation and reordered source records', () => {
    const original = district(12);
    const before = layoutVillage2d(original, true);
    const updated = structuredClone(original);
    updated.projects[0]!.tasks.reverse().forEach((task) => { task.effectiveStatus = 'verified'; task.progress.stage = 'complete'; });
    expect(layoutVillage2d(updated, true).buildings).toEqual(before.buildings);
    expect(layoutVillage2d(original).buildings).toHaveLength(1);
  });

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
    expect(layout.paths.find(({ kind }) => kind === 'square')?.width).toBeLessThan(20);
    expect(layout.paths.filter(({ kind }) => kind === 'horizontal').length).toBeGreaterThanOrEqual(2);
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

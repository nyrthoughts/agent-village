import { describe, expect, it } from 'vitest';
import { observedVillage } from '../../server/activity/projectObserver.js';
import { layoutVillage2d } from './villageLayout2d.js';
import { canWalk, findVillagePath, navigationFor } from './villagePathfinding.js';
import type { VillageLayout2d } from './types.js';

const layout: VillageLayout2d = {
  width: 8, height: 8, entrance: { x: 1, y: 1 }, buildings: [], landmarks: [], paths: [], zones: [],
  obstacles: [{ kind: 'water', x: 3, y: 0, width: 2, height: 6 }],
};

describe('village pathfinding', () => {
  it('blocks the legacy demo forest while keeping its southern entrance open', () => {
    const navigation = navigationFor({ ...layout, width: 64, height: 44, obstacles: undefined });
    expect(canWalk(navigation, { x: 2, y: 10 })).toBe(false);
    expect(canWalk(navigation, { x: 61, y: 12 })).toBe(false);
    expect(canWalk(navigation, { x: 15, y: 41 })).toBe(false);
    expect(canWalk(navigation, { x: 31, y: 40 })).toBe(true);
  });

  it('routes around obstacles without diagonal corner cuts', () => {
    const navigation = navigationFor(layout);
    const path = findVillagePath(navigation, layout.entrance, { x: 6, y: 1 });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: 6, y: 1 });
    let previous = layout.entrance;
    for (const step of path!) {
      expect(canWalk(navigation, step)).toBe(true);
      expect(Math.abs(previous.x - step.x) + Math.abs(previous.y - step.y)).toBe(1);
      previous = step;
    }
    expect(path!.some(({ y }) => y === 6)).toBe(true);
  });

  it('refuses water, out-of-bounds and disconnected destinations', () => {
    const navigation = navigationFor(layout);
    expect(findVillagePath(navigation, layout.entrance, { x: 3, y: 1 })).toBeNull();
    expect(findVillagePath(navigation, layout.entrance, { x: -1, y: 1 })).toBeNull();
    expect(findVillagePath(navigationFor({ ...layout, obstacles: [{ kind: 'forest', x: 3, y: 0, width: 2, height: 8 }] }), layout.entrance, { x: 6, y: 1 })).toBeNull();
    expect(findVillagePath(navigation, layout.entrance, layout.entrance)).toEqual([]);
  });

  it.each([0, 1, 6, 9, 12, 20, 30])('reaches every observed house door from the entrance with %i projects', (count) => {
    const village = observedVillage(Array.from({ length: count }, (_, index) => ({ id: `codex:${index}`, tool: 'codex' as const, state: 'idle' as const, projectKey: `repo-${index}`, project: `Project ${index}`, history: [], lastActivityAt: '2026-09-04T12:00:00Z' })), []);
    const map = layoutVillage2d(village);
    const navigation = navigationFor(map);
    expect(canWalk(navigation, map.entrance)).toBe(true);
    for (const building of map.buildings) {
      expect(building.door).toBeDefined();
      expect(findVillagePath(navigation, map.entrance, building.door!), building.taskId).not.toBeNull();
    }
    for (const landmark of map.landmarks) expect(canWalk(navigation, { x: landmark.x, y: landmark.y })).toBe(false);
  });
});

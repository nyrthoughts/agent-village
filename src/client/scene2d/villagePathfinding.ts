import type { VillageLayout2d } from './types.js';

export interface TilePoint { x: number; y: number }
export interface VillageNavigation { width: number; height: number; blocked: Uint8Array }

export function navigationFor(layout: VillageLayout2d): VillageNavigation {
  const blocked = new Uint8Array(layout.width * layout.height);
  const obstacles = layout.obstacles ?? [
    // Legacy demo terrain has a forest frame and a clear southern entrance.
    { x: 0, y: 0, width: layout.width, height: 5 },
    { x: 0, y: 5, width: 5, height: layout.height - 5 },
    { x: layout.width - 4, y: 5, width: 4, height: layout.height - 5 },
    { x: 0, y: layout.height - 4, width: 29, height: 4 },
    { x: 38, y: layout.height - 4, width: layout.width - 38, height: 4 },
    ...layout.buildings.map(({ x, y }) => ({ x, y, width: 7, height: 6 })),
    ...layout.landmarks,
  ];
  for (const obstacle of obstacles) {
    for (let y = Math.max(0, Math.floor(obstacle.y)); y < Math.min(layout.height, Math.ceil(obstacle.y + obstacle.height)); y++) {
      for (let x = Math.max(0, Math.floor(obstacle.x)); x < Math.min(layout.width, Math.ceil(obstacle.x + obstacle.width)); x++) {
        blocked[y * layout.width + x] = 1;
      }
    }
  }
  return { width: layout.width, height: layout.height, blocked };
}

export function canWalk(navigation: VillageNavigation, point: TilePoint): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0
    && point.x < navigation.width && point.y < navigation.height
    && navigation.blocked[point.y * navigation.width + point.x] === 0;
}

// A four-direction breadth-first search is deterministic and cannot cut obstacle corners.
// The path excludes the starting tile; an empty path means we are already there.
export function findVillagePath(navigation: VillageNavigation, start: TilePoint, end: TilePoint): TilePoint[] | null {
  if (!canWalk(navigation, start) || !canWalk(navigation, end)) return null;
  const index = ({ x, y }: TilePoint) => y * navigation.width + x;
  const first = index(start);
  const last = index(end);
  const parents = new Int32Array(navigation.blocked.length).fill(-1);
  const queue = new Int32Array(parents.length);
  parents[first] = first;
  queue[0] = first;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const current = queue[head++]!;
    if (current === last) {
      const path: TilePoint[] = [];
      for (let cursor = last; cursor !== first; cursor = parents[cursor]!) path.push({ x: cursor % navigation.width, y: Math.floor(cursor / navigation.width) });
      return path.reverse();
    }
    const x = current % navigation.width;
    const y = Math.floor(current / navigation.width);
    for (const next of [{ x, y: y - 1 }, { x: x + 1, y }, { x, y: y + 1 }, { x: x - 1, y }]) {
      if (!canWalk(navigation, next)) continue;
      const nextIndex = index(next);
      if (parents[nextIndex] !== -1) continue;
      parents[nextIndex] = current;
      queue[tail++] = nextIndex;
    }
  }
  return null;
}

export function nearestWalkable(navigation: VillageNavigation, point: TilePoint): TilePoint {
  let result = point;
  let distance = Infinity;
  for (let y = 0; y < navigation.height; y++) for (let x = 0; x < navigation.width; x++) {
    const candidate = Math.abs(x - point.x) + Math.abs(y - point.y);
    if (candidate < distance && canWalk(navigation, { x, y })) { result = { x, y }; distance = candidate; }
  }
  return result;
}

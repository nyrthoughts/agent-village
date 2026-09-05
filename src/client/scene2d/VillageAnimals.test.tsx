import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { observedVillage } from '../../server/activity/projectObserver.js';
import { VillageMap2D } from './VillageMap2D.js';
import { layoutVillage2d } from './villageLayout2d.js';
import { canWalk, navigationFor } from './villagePathfinding.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const village = observedVillage(Array.from({ length: 9 }, (_, index) => ({ id: `codex:${index}`, tool: 'codex' as const, state: 'idle' as const, projectKey: `fictional-${index}`, project: `Fictional ${index}`, history: [], lastActivityAt: '2026-09-04T12:00:00Z' })), []);

it('keeps each decorative patrol within three tiles of free ground, outside tall house silhouettes', () => {
  render(<VillageMap2D village={village} onSelect={() => undefined} />);
  const layout = layoutVillage2d(village);
  const grid = navigationFor(layout);
  for (const animal of [screen.getByTestId('animal-moss-capybara'), screen.getByTestId('animal-copper-otter')]) {
    const x = Number(animal.getAttribute('data-tile-x'));
    const y = Number(animal.getAttribute('data-tile-y'));
    const travel = Number(animal.getAttribute('data-patrol-tiles'));
    expect(travel).toBeGreaterThan(0);
    expect(travel).toBeLessThanOrEqual(3);
    for (let dx = 0; dx < 3 + travel; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(canWalk(grid, { x: x + dx, y: y + dy })).toBe(true);
      expect(layout.buildings.some((house) => x + dx >= house.x && x + dx < house.x + 7 && y + dy >= house.y - 2 && y + dy < house.y + 6)).toBe(false);
    }
    expect(animal.getAttribute('data-worker-id')).toBeNull();
    expect(animal.getAttribute('aria-label')).toContain('decorative');
  }
});

it('pauses decorative motion while offscreen, hidden or reduced-motion is selected', () => {
  const intersections: Array<(visible: boolean) => void> = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersections.push((visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver)); }
    observe() {}
    disconnect() {}
  });
  let hidden = false;
  let reduced = false;
  const preferenceChanges = new Set<() => void>();
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_event: string, callback: () => void) => preferenceChanges.add(callback), removeEventListener: (_event: string, callback: () => void) => preferenceChanges.delete(callback) }));
  render(<VillageMap2D village={village} onSelect={() => undefined} />);
  const animals = [screen.getByTestId('animal-moss-capybara'), screen.getByTestId('animal-copper-otter')];
  expect(animals.every((animal) => animal.getAttribute('data-motion') === 'paused')).toBe(true);
  act(() => intersections.forEach((visible) => visible(true)));
  expect(animals.every((animal) => animal.getAttribute('data-motion') === 'running')).toBe(true);
  act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  expect(animals.every((animal) => animal.getAttribute('data-motion') === 'paused')).toBe(true);
  act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); intersections[0]!(false); });
  expect(animals[0]!.getAttribute('data-motion')).toBe('paused');
  expect(animals[1]!.getAttribute('data-motion')).toBe('running');
  act(() => { reduced = true; preferenceChanges.forEach((callback) => callback()); });
  expect(animals.every((animal) => animal.getAttribute('data-motion') === 'paused')).toBe(true);
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { VillageMap2D } from './VillageMap2D.js';
import { layoutVillage2d } from './villageLayout2d.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function animationClock() {
  let time = 0;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return (count = 1) => {
    for (let index = 0; index < count; index++) act(() => {
      time += 32;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    });
  };
}

function pointer(type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel', target: Element, x: number, y: number, pointerType = 'mouse') {
  // jsdom has no native PointerEvent; retain the real pointer payload for React handlers.
  const event = new Event(type.replace(/[A-Z]/g, (letter) => letter.toLowerCase()), { bubbles: true });
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, pointerType });
  fireEvent(target, event);
}

function groundTile(x: number, y: number, pointerType = 'mouse') {
  const map = screen.getByTestId('village-map-2d');
  const world = map.querySelector('.pixel-world')!;
  vi.spyOn(world, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1024, bottom: 704, width: 1024, height: 704, toJSON: () => undefined });
  pointer('pointerDown', world, (x + 0.5) * 16, (y + 0.5) * 16, pointerType);
  pointer('pointerUp', world, (x + 0.5) * 16, (y + 0.5) * 16, pointerType);
}

const village: DerivedWorkspace = {
  version: 1,
  name: 'Verdant Labs',
  progress: { verified: 1, total: 2, remaining: 1 },
  projects: [{
    id: 'atlas', name: 'Atlas', objective: 'Map it', effectiveStatus: 'in_progress', progress: { verified: 1, total: 2, remaining: 1 }, features: [],
    tasks: [
      { id: 'contours', title: 'Contour studio', owner: 'Mira', effectiveStatus: 'in_progress', roof: false, progress: { stage: 'foundation', stageIndex: 1, verified: 0, total: 1, remaining: 1 }, warnings: [], subtasks: [] },
      { id: 'library', title: 'Field library', owner: 'Nori', effectiveStatus: 'verified', roof: true, progress: { stage: 'complete', stageIndex: 5, verified: 1, total: 1, remaining: 0 }, warnings: [], subtasks: [] },
    ],
  }],
};

const activity: ActivitySnapshot = {
  status: 'live', fetchedAt: '2026-09-01T12:00:00.000Z', workers: [
    { id: 'codex', tool: 'codex', role: 'lead', state: 'working', title: 'Build contours', attachedTaskId: 'contours', lastActivityAt: '2026-09-01T12:00:00.000Z' },
    { id: 'claude', tool: 'claude', role: 'helper', parentId: 'codex', state: 'waiting', title: 'Review map', attachedTaskId: 'library', lastActivityAt: '2026-09-01T12:00:00.000Z' },
  ],
};

describe('VillageMap2D', () => {
  it('renders every task and maps live workers into the pixel world', () => {
    render(<VillageMap2D village={village} activity={activity} onSelect={() => undefined} />);
    const map = screen.getByTestId('village-map-2d');
    expect(map.getAttribute('data-building-count')).toBe('2');
    expect(map.getAttribute('data-worker-count')).toBe('2');
    expect(map.getAttribute('data-lead-count')).toBe('1');
    expect(map.getAttribute('data-helper-count')).toBe('1');
    expect(map.getAttribute('data-world-width')).toBe('64');
    expect(screen.getByRole('button', { name: /Contour studio/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Codex lead agent/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Claude helper agent/ })).toBeTruthy();
  });

  it('forwards worker selection independently from building selection', () => {
    const onSelectWorker = vi.fn();
    render(<VillageMap2D village={village} activity={activity} onSelect={() => undefined} onSelectWorker={onSelectWorker} />);
    fireEvent.click(screen.getByRole('button', { name: /Codex lead agent/ }));
    expect(onSelectWorker).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'codex' }),
      expect.any(HTMLButtonElement),
    );
  });

  it('keeps a helper beside its lead even when its own task mapping differs', () => {
    render(<VillageMap2D village={village} activity={activity} onSelect={() => undefined} />);
    const leadPlot = screen.getByRole('button', { name: /Codex lead agent/ }).parentElement as HTMLElement;
    const helperPlot = screen.getByRole('button', { name: /Claude helper agent/ }).parentElement as HTMLElement;
    expect(Math.abs(Number.parseInt(helperPlot.style.left) - Number.parseInt(leadPlot.style.left))).toBeLessThanOrEqual(32);
    expect(Math.abs(Number.parseInt(helperPlot.style.top) - Number.parseInt(leadPlot.style.top))).toBeLessThanOrEqual(32);
  });

  it('never invents workers when activity is absent', () => {
    render(<VillageMap2D village={village} activity={{ ...activity, status: 'absent', workers: [] }} onSelect={() => undefined} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-worker-count')).toBe('0');
    expect(screen.getAllByRole('button', { name: /studio|library/i })).toHaveLength(2);
  });

  it('supports bounded keyboard navigation and reset', () => {
    render(<VillageMap2D village={village} activity={activity} onSelect={() => undefined} />);
    const map = screen.getByTestId('village-map-2d');
    fireEvent.keyDown(map, { key: 'ArrowRight' });
    expect(Number(map.getAttribute('data-camera-x'))).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reset village view' }));
    expect(map.getAttribute('data-camera-x')).toBe('0');
    expect(map.getAttribute('data-camera-y')).toBe('0');
  });

  it('forwards building selection with its project context', () => {
    const onSelect = vi.fn();
    render(<VillageMap2D village={village} activity={activity} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Contour studio/ }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contours' }),
      expect.any(HTMLButtonElement),
      expect.objectContaining({ id: 'atlas' }),
    );
  });

  it('makes walking optional and keeps keyboard activation immediate in visit mode', () => {
    const onSelect = vi.fn();
    render(<VillageMap2D village={village} onSelect={onSelect} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-visit-mode')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Visit the village' }));
    fireEvent.click(screen.getByRole('button', { name: /Contour studio/ }), { detail: 0 });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('false');
  });

  it('walks to a house before opening it and preserves its route through polling', () => {
    const advance = animationClock();
    const onSelect = vi.fn();
    const { rerender } = render(<VillageMap2D village={village} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Visit the village' }));
    fireEvent.click(screen.getByRole('button', { name: /Contour studio/ }), { detail: 1 });
    expect(onSelect).not.toHaveBeenCalled();
    advance(8);
    const before = screen.getByTestId('village-map-2d').getAttribute('data-player-y');
    rerender(<VillageMap2D village={structuredClone(village)} onSelect={onSelect} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe(before);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('true');
    advance(400);
    expect(onSelect).toHaveBeenCalledOnce();
    const placement = layoutVillage2d(village).buildings[0]!;
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-x')).toBe(String(placement.door?.x ?? placement.x + 3));
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe(String(placement.door?.y ?? placement.y + 6));
  });

  it('replaces a destination, stops with Escape and never opens the abandoned house', () => {
    const advance = animationClock();
    const onSelect = vi.fn();
    render(<VillageMap2D village={village} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Visit the village' }));
    fireEvent.click(screen.getByRole('button', { name: /Contour studio/ }), { detail: 1 });
    advance(8);
    groundTile(31, 38);
    advance(40);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-x')).toBe('31');
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe('38');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Field library/ }), { detail: 1 });
    advance(6);
    fireEvent.keyDown(screen.getByTestId('village-map-2d'), { key: 'Escape' });
    const stopped = screen.getByTestId('village-map-2d').getAttribute('data-player-y');
    advance(400);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe(stopped);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('refuses water and supports touch without treating camera dragging as a destination', () => {
    const advance = animationClock();
    render(<VillageMap2D village={village} onSelect={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Visit the village' }));
    groundTile(48, 30, 'touch');
    expect(screen.getByRole('status').textContent).toBe('Destination is not reachable.');
    const map = screen.getByTestId('village-map-2d');
    expect(map.getAttribute('data-player-walking')).toBe('false');
    groundTile(31, 38, 'touch');
    advance(40);
    expect(map.getAttribute('data-player-y')).toBe('38');
    pointer('pointerDown', map, 100, 100, 'touch');
    pointer('pointerMove', map, 180, 130, 'touch');
    pointer('pointerUp', map, 180, 130, 'touch');
    expect(map.getAttribute('data-player-walking')).toBe('false');
    expect(map.getAttribute('data-player-y')).toBe('38');
    expect(map.getAttribute('data-camera-x')).not.toBe('0');
  });

  it('skips animation for reduced motion and changes only the avatar appearance', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const onSelect = vi.fn();
    render(<VillageMap2D village={village} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Visit the village' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Your avatar appearance' }), { target: { value: 'iris' } });
    expect(screen.getByTestId('village-avatar').className).toContain('pixel-avatar--iris');
    fireEvent.click(screen.getByRole('button', { name: /Contour studio/ }), { detail: 1 });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('false');
    expect(screen.getByRole('status').textContent).toBe('You have arrived.');
  });
});

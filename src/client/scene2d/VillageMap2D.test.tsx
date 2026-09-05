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
  const width = Number(map.getAttribute('data-world-width')) * 16;
  const height = Number(map.getAttribute('data-world-height')) * 16;
  vi.spyOn(world, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => undefined });
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

const nativeDistrict: DerivedWorkspace = {
  ...village,
  observation: { fetchedAt: '2026-09-05T12:00:00Z', errors: [], historyWindow: '', focusProjects: [] },
  projects: [{
    ...village.projects[0]!,
    observation: { sessions: [], lastActivityAt: '2026-09-05T12:00:00Z', buildingFamilyIndex: 0 },
    plan: { objective: 'Map it', revision: 1, updatedAt: '2026-09-05T12:00:00Z', milestones: [{ id: 'contours', title: 'Contours', validated: false, note: '' }, { id: 'library', title: 'Library', validated: true, note: 'Reviewed', validatedBy: 'owner', validatedAt: '2026-09-05T12:00:00Z' }] },
    tasks: [{ ...village.projects[0]!.tasks[0]!, id: 'atlas', title: 'Common house' }, ...village.projects[0]!.tasks.map((task) => ({ ...task, id: `atlas:${task.id}` }))],
  }],
};

describe('VillageMap2D', () => {
  it('shows milestone parcels only in district mode and keeps their exact click context', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<VillageMap2D village={nativeDistrict} onSelect={onSelect} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-building-count')).toBe('1');
    rerender(<VillageMap2D village={nativeDistrict} district onSelect={onSelect} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-building-count')).toBe('3');
    expect(screen.getByTestId('village-map-2d').getAttribute('data-district')).toBe('true');
    expect(screen.getAllByTestId('district-parcel-label')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('pixel-building-atlas:library'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'atlas:library' }), expect.any(HTMLButtonElement), expect.objectContaining({ id: 'atlas' }));
  });

  it('keeps project-level agents at the common house and treats unconfirmed native working as unknown', () => {
    const workers = activity.workers.map((worker) => ({ ...worker, attachedTaskId: 'atlas' }));
    render(<VillageMap2D village={nativeDistrict} district activity={{ ...activity, workers }} onSelect={() => undefined} />);
    const common = layoutVillage2d(nativeDistrict, true).buildings.find((plot) => plot.taskId === 'atlas')!;
    const lead = screen.getByRole('button', { name: /Codex lead agent/ });
    expect(lead.className).toContain('pixel-worker--unknown');
    expect((lead.parentElement as HTMLElement).style.left).toBe(`${(common.x + 8) * 16}px`);
    expect((lead.parentElement as HTMLElement).style.top).toBe(`${(common.y + 2) * 16}px`);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-worker-count')).toBe('2');
  });

  it('preserves district walking through polling and still opens a parcel immediately', () => {
    const advance = animationClock();
    const onSelect = vi.fn();
    const { rerender } = render(<VillageMap2D village={nativeDistrict} district onSelect={onSelect} />);
    const layout = layoutVillage2d(nativeDistrict, true);
    groundTile(layout.entrance.x, layout.entrance.y - 7);
    advance(5);
    rerender(<VillageMap2D village={structuredClone(nativeDistrict)} district onSelect={onSelect} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('true');
    fireEvent.click(screen.getByTestId('pixel-building-atlas:library'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('false');
    advance(100);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('expires native sprites, counts and common-house accent when sources stop refreshing', () => {
    const now = Date.parse('2026-09-05T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const workers = activity.workers.map((worker) => ({ ...worker, state: 'working' as const, attachedTaskId: 'atlas', activityEvidence: { level: 'confirmed' as const, source: 'claude-process' as const, observedAt: new Date(now).toISOString() } }));
    const source = { ...nativeDistrict, projects: nativeDistrict.projects.map((project) => ({ ...project, observation: { ...project.observation!, sessions: workers.map((worker) => ({ ...worker, history: [], projectKey: 'atlas' })) } })) };
    const snapshot = { ...activity, workers };
    const { rerender } = render(<VillageMap2D village={source} district activity={snapshot} now={now} onSelect={() => undefined} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-confirmed-helper-count')).toBe('1');
    expect(screen.getByTestId('pixel-building-atlas').getAttribute('data-working')).toBe('true');
    expect(screen.getByRole('button', { name: /Claude helper agent/ }).className).toContain('pixel-worker--working');
    rerender(<VillageMap2D village={source} district activity={snapshot} now={now + 120_001} onSelect={() => undefined} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-confirmed-helper-count')).toBe('0');
    expect(screen.getByTestId('pixel-building-atlas').getAttribute('data-working')).toBeNull();
    expect(screen.getByRole('button', { name: /Claude helper agent/ }).className).toContain('pixel-worker--unknown');
    expect(screen.getByRole('button', { name: /Codex lead agent/ }).getAttribute('aria-label')).toContain('1 observed helpers, 0 confirmed working');
  });

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

  it('supports bounded Shift-arrow camera navigation and reset', () => {
    render(<VillageMap2D village={village} activity={activity} onSelect={() => undefined} />);
    const map = screen.getByTestId('village-map-2d');
    fireEvent.keyDown(map, { key: 'ArrowRight', shiftKey: true });
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

  it('walks on the first ground click without a mode switch', () => {
    const advance = animationClock();
    const onSelect = vi.fn();
    render(<VillageMap2D village={village} onSelect={onSelect} />);
    groundTile(31, 38);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('true');
    advance(40);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe('38');
    expect(screen.queryByRole('button', { name: 'Visit the village' })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('false');
  });

  it('preserves a ground route through polling', () => {
    const advance = animationClock();
    const onSelect = vi.fn();
    const { rerender } = render(<VillageMap2D village={village} onSelect={onSelect} />);
    groundTile(31, 8);
    expect(onSelect).not.toHaveBeenCalled();
    advance(8);
    const before = screen.getByTestId('village-map-2d').getAttribute('data-player-y');
    rerender(<VillageMap2D village={structuredClone(village)} onSelect={onSelect} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe(before);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('true');
    advance(400);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-x')).toBe('31');
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe('8');
  });

  it('replaces a destination and stops with Escape', () => {
    const advance = animationClock();
    const onSelect = vi.fn();
    render(<VillageMap2D village={village} onSelect={onSelect} />);
    groundTile(31, 8);
    advance(8);
    groundTile(31, 38);
    advance(40);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-x')).toBe('31');
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe('38');
    expect(onSelect).not.toHaveBeenCalled();
    groundTile(31, 8);
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
    fireEvent.change(screen.getByRole('combobox', { name: 'Your avatar appearance' }), { target: { value: 'iris' } });
    expect(screen.getByTestId('village-avatar').className).toContain('pixel-avatar--iris');
    groundTile(31, 38);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe('38');
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('false');
    expect(screen.getByRole('status').textContent).toBe('You have arrived.');
  });

  it.each([0, 1])('opens a house immediately and cancels walking for activation detail %i', (detail) => {
    const advance = animationClock();
    const onSelect = vi.fn();
    render(<VillageMap2D village={village} onSelect={onSelect} />);
    groundTile(31, 8);
    advance(8);
    fireEvent.click(screen.getByRole('button', { name: /Contour studio/ }), { detail });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-walking')).toBe('false');
    advance(400);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('moves with arrows after a map control and does not consume select navigation', () => {
    const advance = animationClock();
    render(<VillageMap2D village={village} onSelect={() => undefined} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reset village view' }), { key: 'ArrowUp' });
    advance(20);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe('39');
    const appearance = screen.getByRole('combobox', { name: 'Your avatar appearance' });
    fireEvent.keyDown(appearance, { key: 'ArrowUp' });
    advance(20);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-player-y')).toBe('39');
  });

  it('retains available workers and distinct helper counts during partial observation', () => {
    render(<VillageMap2D village={village} activity={{ ...activity, status: 'degraded', workers: [...activity.workers, activity.workers[1]!] }} onSelect={() => undefined} />);
    const map = screen.getByTestId('village-map-2d');
    expect(map.getAttribute('data-worker-count')).toBe('2');
    expect(map.getAttribute('data-helper-count')).toBe('1');
    expect(screen.getByRole('button', { name: /Codex lead agent/ }).textContent).toContain('1');
  });

  it('includes two decorative animals without adding workers', () => {
    render(<VillageMap2D village={village} onSelect={() => undefined} />);
    expect(screen.getByTestId('animal-moss-capybara')).toBeTruthy();
    expect(screen.getByTestId('animal-copper-otter')).toBeTruthy();
    expect(screen.getByTestId('village-map-2d').getAttribute('data-worker-count')).toBe('0');
  });

  it('bounds busy house sprites but counts all observed helpers and only confirmed work', () => {
    const workers = [activity.workers[0]!, ...Array.from({ length: 24 }, (_, index) => ({ ...activity.workers[1]!, id: `helper-${index}`, state: 'working' as const, activityEvidence: { level: index === 0 ? 'confirmed' as const : 'detected' as const, source: 'claude-process' as const, observedAt: new Date(Date.now() - 1000).toISOString() } }))];
    render(<VillageMap2D village={village} activity={{ ...activity, status: 'degraded', workers }} onSelect={() => undefined} />);
    const map = screen.getByTestId('village-map-2d');
    expect(map.getAttribute('data-worker-count')).toBe('25');
    expect(map.getAttribute('data-helper-count')).toBe('24');
    expect(map.getAttribute('data-confirmed-helper-count')).toBe('1');
    expect(map.querySelectorAll('[data-worker-id]')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /Codex lead agent/ }).getAttribute('aria-label')).toContain('24 observed helpers, 1 confirmed working');
  });

  it('never counts expired demo evidence as confirmed while leaving unproven fictional work animated', () => {
    const workers = [activity.workers[0]!, { ...activity.workers[1]!, state: 'working' as const, activityEvidence: { level: 'confirmed' as const, source: 'claude-process' as const, observedAt: new Date(Date.now() - 120_001).toISOString() } }];
    render(<VillageMap2D village={village} activity={{ ...activity, workers }} onSelect={() => undefined} />);
    expect(screen.getByTestId('village-map-2d').getAttribute('data-confirmed-helper-count')).toBe('0');
    expect(screen.getByRole('button', { name: /Claude helper agent/ }).className).toContain('pixel-worker--unknown');
    const lead = screen.getByRole('button', { name: /Codex lead agent/ });
    expect(lead.className).toContain('pixel-worker--working');
    expect(lead.getAttribute('aria-label')).toContain('1 observed helpers, 0 confirmed working');
  });
});

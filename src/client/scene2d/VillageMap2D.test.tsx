import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { VillageMap2D } from './VillageMap2D.js';

afterEach(cleanup);

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
});

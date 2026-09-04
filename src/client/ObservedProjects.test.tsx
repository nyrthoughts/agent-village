import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ObservedProjects } from './ObservedProjects.js';
import { observedVillage } from '../server/activity/projectObserver.js';
import { layoutVillage2d } from './scene2d/villageLayout2d.js';
import { fitVillageScale } from './scene2d/VillageMap2D.js';
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it('fits the whole native map on desktop and mobile without fixed tiny scaling', () => {
  expect(fitVillageScale(1000, 740, 64, 44)).toBeGreaterThan(0.85);
  expect(fitVillageScale(360, 400, 64, 44) * 64 * 16).toBeLessThanOrEqual(320);
});

it('shows a project building and sourced report instead of unavailable metrics', () => {
  const village = observedVillage([{ id: 'claude:one', tool: 'claude', state: 'working', projectKey: 'repo', project: 'Connector', title: 'Connect', history: [{ at: '2026-09-04T12:00:00Z', kind: 'report', text: 'Tests passed. Deployment remains.' }], summary: 'Tests passed. Deployment remains.', lastActivityAt: '2026-09-04T12:00:00Z' }], []);
  render(<ObservedProjects village={village} />);
  expect(screen.getByText('1 projets · 1 sessions')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Ouvrir Connector/ }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getAllByText('Tests passed. Deployment remains.').length).toBeGreaterThan(0);
  expect(screen.queryByText('Unavailable')).toBeNull();
  expect(screen.getByText(/déclarations des agents/)).toBeTruthy();
});

it('shows focused projects and a cross-session project catch-up with a readable history', () => {
  const make = (id: string, name: string, at: string, text: string) => ({ id, tool: 'codex' as const, state: 'idle' as const, projectKey: name, project: name, history: [{ at, kind: 'report' as const, text }], lastActivityAt: at });
  const village = observedVillage([
    make('one', 'Product', '2026-09-04T12:00:00Z', '## Fait\n- Parser livré.\n## Reste à faire\n- Revue indépendante.'),
    make('two', 'Product', '2026-09-04T11:00:00Z', 'Premier prototype.'),
    make('personal', 'Personal', '2026-09-04T13:00:00Z', 'Unrelated research.'),
  ], []);
  village.observation!.focusProjects = ['Product'];
  render(<ObservedProjects village={village} />);
  expect(screen.queryByRole('button', { name: 'Ouvrir Personal' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Product' }));
  expect(screen.getByRole('heading', { name: 'Bilan du projet' })).toBeTruthy();
  expect(screen.getByText('Parser livré.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Évolution' }));
  expect(screen.getByText('Premier prototype.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Marquer comme lu' }));
  expect(localStorage.getItem('agent-village:read')).toContain('2026-09-04T12:00:00Z');
});

it('updates an already open project and counts new reports after marking it read', () => {
  const make = (at: string, text: string) => observedVillage([{ id: 'one', tool: 'codex', state: 'working', projectKey: 'Product', project: 'Product', history: [{ at, kind: 'report', text }], lastActivityAt: at }], []);
  const { rerender } = render(<ObservedProjects village={make('2026-09-04T12:00:00Z', 'Initial result.')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Product' }));
  fireEvent.click(screen.getByRole('button', { name: 'Marquer comme lu' }));
  rerender(<ObservedProjects village={make('2026-09-04T12:01:00Z', 'New result.')} />);
  expect(screen.getAllByText('New result.').length).toBeGreaterThan(0);
  expect(screen.getByText('1 nouveaux échanges')).toBeTruthy();
});

it('keeps nine observed project buildings in a compact map', () => {
  const village = observedVillage(Array.from({ length: 9 }, (_, i) => ({ id: `codex:${i}`, tool: 'codex' as const, state: 'idle' as const, projectKey: `repo-${i}`, project: `Project ${i}`, history: [], lastActivityAt: '2026-09-04T12:00:00Z' })), []);
  const layout = layoutVillage2d(village);
  expect(layout.buildings).toHaveLength(9);
  expect(layout.height).toBeLessThanOrEqual(60);
});

import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ObservedProjects } from './ObservedProjects.js';
import { observedVillage } from '../server/activity/projectObserver.js';
import { layoutVillage2d } from './scene2d/villageLayout2d.js';

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

it('keeps nine observed project buildings in a compact map', () => {
  const village = observedVillage(Array.from({ length: 9 }, (_, i) => ({ id: `codex:${i}`, tool: 'codex' as const, state: 'idle' as const, projectKey: `repo-${i}`, project: `Project ${i}`, history: [], lastActivityAt: '2026-09-04T12:00:00Z' })), []);
  const layout = layoutVillage2d(village);
  expect(layout.buildings).toHaveLength(9);
  expect(layout.height).toBeLessThanOrEqual(60);
});

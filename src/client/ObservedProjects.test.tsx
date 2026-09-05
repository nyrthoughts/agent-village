import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ObservedProjects } from './ObservedProjects.js';
import { observedVillage } from '../server/activity/projectObserver.js';
import { layoutVillage2d } from './scene2d/villageLayout2d.js';
import { fitVillageScale } from './scene2d/VillageMap2D.js';
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it('does not offer a zero-project scope expansion', () => {
  const village = observedVillage([{ id: 'codex:a', tool: 'codex', state: 'idle', projectKey: 'One', project: 'One', title: 'Source', history: [], lastActivityAt: '2026-09-04T12:00:00Z' }], [], ['One']);
  render(<ObservedProjects village={village} />);
  expect(screen.queryByRole('button', { name: 'Voir aussi les 0 autres projets' })).toBeNull();
});
it('offers a concise sourced journal point that opens the project directly', () => {
  const village = observedVillage([{ id: 'codex:a', tool: 'codex', state: 'waiting', projectKey: 'One', project: 'One', title: 'Source', history: [{ at: '2026-09-04T12:00:00Z', kind: 'report', text: '## Suite\n- Vérifier le déploiement.' }], lastActivityAt: '2026-09-04T12:00:00Z' }], []);
  render(<ObservedProjects village={village} />);
  expect(screen.getByRole('heading', { name: 'À lire en premier' })).toBeTruthy();
  expect(screen.getByText('Suite annoncée')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Lire le point de One' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.queryByText('Décision requise')).toBeNull();
});
it('switches the entire native interface to English, preserves source text and remembers the choice', () => {
  const village = observedVillage([{ id: 'codex:en', tool: 'codex', state: 'working', projectKey: 'Product', project: 'Product', title: 'Projet original', history: [{ at: '2026-09-04T12:00:00Z', kind: 'report', text: '## Fait\n- Tests terminés.\n## Suite\n- Déployer.' }], lastActivityAt: '2026-09-04T12:00:00Z', sourceNote: 'Journal Codex local · état du dernier événement, pas une preuve de livraison' }], ['Codex : index local inaccessible']);
  const view = render(<ObservedProjects village={village} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Langue / Language' }), { target: { value: 'en' } });
  expect(document.documentElement.lang).toBe('en');
  expect(screen.getByRole('heading', { name: 'Village journal' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('Codex: local index unavailable');
  expect(screen.getByRole('button', { name: /^Product\. 1 sessions · 1 working/ })).toBeTruthy();
  expect(screen.getByText(/Source conversations stay in their original language/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open Product' }));
  expect(screen.getByRole('heading', { name: 'Project brief' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Done — reported by agents' })).toBeTruthy();
  expect(screen.getByText('Tests terminés.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
  expect(screen.getByRole('heading', { name: 'What changed' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Conversations' }));
  expect(screen.getByRole('heading', { name: 'Recent history' })).toBeTruthy();
  expect(screen.getByText(/Local Codex log · latest event state, not proof of delivery/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close project' }));
  view.unmount();
  render(<ObservedProjects village={village} />);
  expect(screen.getByRole('heading', { name: 'Village journal' })).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Langue / Language' }), { target: { value: 'fr' } });
  expect(screen.getByRole('heading', { name: 'Journal du village' })).toBeTruthy();
  expect(document.documentElement.lang).toBe('fr');
});

it('falls back to French when the saved language is unsupported', () => {
  localStorage.setItem('agent-village:language', 'unsupported');
  render(<ObservedProjects village={observedVillage([], [])} />);
  expect(screen.getByRole('heading', { name: 'Journal du village' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Langue / Language' })).toHaveProperty('value', 'fr');
});

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

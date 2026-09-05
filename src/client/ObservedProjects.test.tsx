import { act, cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ObservedProjects } from './ObservedProjects.js';
import { observedVillage } from '../server/activity/projectObserver.js';
import { layoutVillage2d } from './scene2d/villageLayout2d.js';
import { fitVillageScale } from './scene2d/VillageMap2D.js';
import { milestoneTaskId } from './observedDistrict.js';
import type { ProjectPlan } from '../shared/projectPlan.js';
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('separates root conversations from detected helpers and exposes explicit project goals', () => {
  const base = { tool: 'codex' as const, state: 'unknown' as const, projectKey: 'One', project: 'One', title: 'Source', history: [], lastActivityAt: '2026-09-04T12:00:00Z' };
  const village = observedVillage([{ ...base, id: 'lead', role: 'lead' }, { ...base, id: 'child', role: 'helper', parentId: 'lead', activityEvidence: { source: 'codex-index', level: 'recent', observedAt: base.lastActivityAt } }], []);
  render(<ObservedProjects village={village} />);
  expect(screen.getByText('1 projets · 1 sessions')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir One' }));
  expect(screen.getByRole('region', { name: 'Agents et observations' }).textContent).toContain('1 sous-agents détectés');
  expect(screen.getByRole('region', { name: 'Agents et observations' }).textContent).toContain('0 en cours confirmés');
  expect(screen.getByRole('button', { name: 'Définir l’objectif' })).toBeTruthy();
});
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
  expect(screen.getByRole('button', { name: /^Product\..*Plan not defined/ })).toBeTruthy();
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

it('enters a project district, opens the exact parcel without walking and returns to all districts', () => {
  const source = observedVillage(['Harbor', 'Orchard'].map((name) => ({ id: name, tool: 'codex' as const, role: 'lead' as const, state: 'waiting' as const, projectKey: name, project: name, history: [], lastActivityAt: '2026-09-05T12:00:00Z' })), []);
  const harbor = source.projects[0]!;
  const plan: ProjectPlan = { projectName: harbor.name, objective: 'Open the harbor', revision: 1, updatedAt: '2026-09-05T12:00:00Z', milestones: [
    { id: 'dock', title: 'Dock route', validated: true, note: 'The route was checked', validatedAt: '2026-09-05T12:00:00Z', validatedBy: 'owner' },
    { id: 'garden', title: 'Garden route', validated: false, note: '' },
  ] };
  const village = observedVillage(source.projects.flatMap((p) => p.observation!.sessions), [], [], { [harbor.id]: plan });
  const view = render(<ObservedProjects village={village} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Quartier' }), { target: { value: harbor.id } });
  expect(screen.getByTestId('village-map-2d')).toHaveAttribute('data-building-count', '3');
  fireEvent.click(screen.getByTestId(`pixel-building-${milestoneTaskId(harbor.id, 'garden')}`));
  const selected = screen.getByRole('region', { name: 'Chantier sélectionné' });
  expect(within(selected).getByText('Garden route')).toBeTruthy();
  expect(within(selected).queryByText('Dock route')).toBeNull();
  expect(within(selected).getByText('Jalon non validé')).toBeTruthy();
  expect(screen.getByTestId('village-map-2d')).toHaveAttribute('data-player-walking', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Modifier ce jalon' }));
  expect(screen.getByLabelText('Jalon 2')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Fermer le projet' }));
  const updated = { ...plan, revision: 2, milestones: plan.milestones.map((m) => ({ ...m, validated: true, note: 'Checked route', validatedAt: '2026-09-05T12:10:00Z', validatedBy: 'owner' as const })) };
  view.rerender(<ObservedProjects village={observedVillage(source.projects.flatMap((p) => p.observation!.sessions), [], [], { [harbor.id]: updated })} />);
  expect(screen.getByTestId(`pixel-building-${milestoneTaskId(harbor.id, 'garden')}`)).toHaveAttribute('data-stage', 'complete');
  fireEvent.click(screen.getByRole('button', { name: 'Tous les quartiers' }));
  expect(screen.getByTestId('village-map-2d')).toHaveAttribute('data-building-count', '2');
});

it('offers every visible district even beyond the nine overview entrances', () => {
  const village = observedVillage(Array.from({ length: 12 }, (_, i) => ({ id: `lead-${i}`, tool: 'codex' as const, state: 'unknown' as const, projectKey: `p-${i}`, project: `District ${i}`, history: [], lastActivityAt: '2026-09-05T12:00:00Z' })), []);
  render(<ObservedProjects village={village} />);
  expect(within(screen.getByRole('combobox', { name: 'Quartier' })).getAllByRole('option')).toHaveLength(13);
  fireEvent.change(screen.getByRole('combobox', { name: 'Quartier' }), { target: { value: village.projects[11]!.id } });
  expect(screen.getByTestId('village-map-2d')).toHaveAttribute('data-building-count', '1');
  expect(screen.getByText('Aucun jalon défini : ouvre la maison commune pour préparer le plan.')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Langue / Language' }), { target: { value: 'en' } });
  expect(screen.getByRole('combobox', { name: 'District' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'All districts' })).toBeTruthy();
});

it('keeps a meaningful keyboard focus when a district transition removes its trigger', () => {
  const village = observedVillage([{ id: 'lead', tool: 'codex', state: 'waiting', projectKey: 'harbor', project: 'Harbor', history: [], lastActivityAt: '2026-09-05T12:00:00Z' }], []);
  render(<ObservedProjects village={village} />);
  fireEvent.click(screen.getByTestId(`pixel-building-${village.projects[0]!.id}`));
  fireEvent.click(screen.getByRole('button', { name: 'Explorer ce quartier' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('combobox', { name: 'Quartier' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Tous les quartiers' }));
  expect(screen.getByRole('combobox', { name: 'Quartier' })).toHaveFocus();
});

it('expires native work indicators even when a failed poll leaves the same snapshot in place', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
  const session = { id: 'lead', role: 'lead' as const, tool: 'claude' as const, state: 'working' as const, title: 'Source', project: 'Harbor', projectKey: 'harbor', history: [], lastActivityAt: new Date().toISOString(), activityEvidence: { level: 'confirmed' as const, source: 'claude-process' as const, observedAt: new Date().toISOString() } };
  const village = observedVillage([session], []);
  const activity = { status: 'live' as const, fetchedAt: new Date().toISOString(), workers: [{ ...session, attachedTaskId: village.projects[0]!.id }] };
  const view = render(<ObservedProjects village={village} activity={activity} error="Source unavailable" />);
  expect(view.container.querySelector('.pixel-worker--working')).toBeTruthy();
  expect(screen.getByText('1 en cours confirmés')).toBeTruthy();
  act(() => vi.advanceTimersByTime(125_000));
  expect(view.container.querySelector('.pixel-worker--working')).toBeNull();
  expect(view.container.querySelector('.pixel-worker--unknown')).toBeTruthy();
  expect(screen.getByText('0 en cours confirmés')).toBeTruthy();
});

it('accepts new confirmed observations between the independent clock ticks', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
  const snapshot = () => {
    const at = new Date().toISOString();
    const session = { id: 'lead', role: 'lead' as const, tool: 'claude' as const, state: 'working' as const, title: 'Source', project: 'Harbor', projectKey: 'harbor', history: [], lastActivityAt: at, activityEvidence: { level: 'confirmed' as const, source: 'claude-process' as const, observedAt: at } };
    const village = observedVillage([session], []);
    return { village, activity: { status: 'live' as const, fetchedAt: at, workers: [{ ...session, attachedTaskId: village.projects[0]!.id }] } };
  };
  const view = render(<ObservedProjects {...snapshot()} />);
  act(() => vi.advanceTimersByTime(1_000));
  view.rerender(<ObservedProjects {...snapshot()} />);
  expect(screen.getByText('1 en cours confirmés')).toBeTruthy();
  expect(view.container.querySelector('.pixel-worker--working')).toBeTruthy();
});

it('expires recent helper analytics in the open project during a source outage', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
  const session = { id: 'helper', role: 'helper' as const, tool: 'claude' as const, state: 'working' as const, title: 'Source', project: 'Harbor', projectKey: 'harbor', history: [], lastActivityAt: new Date().toISOString(), activityEvidence: { level: 'recent' as const, source: 'claude-hook' as const, observedAt: new Date().toISOString() } };
  render(<ObservedProjects village={observedVillage([session], [])} error="Source unavailable" />);
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Harbor' }));
  const stats = screen.getByRole('region', { name: 'Agents et observations' });
  const recent = within(stats).getByText('Activité récente').parentElement!;
  expect(recent.querySelector('dd')).toHaveTextContent('1');
  act(() => vi.advanceTimersByTime(125_000));
  expect(recent.querySelector('dd')).toHaveTextContent('0');
});
import '@testing-library/jest-dom/vitest';

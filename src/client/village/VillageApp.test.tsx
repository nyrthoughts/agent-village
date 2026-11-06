import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../fixtures/board.demo.json';
import { fixtureSnapshot } from '../../server/board/staticBoard.js';
import { buildBoardView } from '../../shared/boardView.js';
import type { FeedState } from '../hooks/useEventStream.js';
import { VillageApp } from './VillageApp.js';

const mock = vi.hoisted(() => ({ feed: {} as FeedState }));
vi.mock('../hooks/useEventStream.js', () => ({ useEventStream: () => mock.feed }));

beforeEach(() => {
  localStorage.clear();
  mock.feed = { snapshot: fixtureSnapshot(fixture), status: 'polling', received: [] };
});
afterEach(cleanup);

it.each(['2026-10-14T12:00:00.000Z', '2026-10-14T17:00:00.000Z'])('does not animate a stale or future working signal (%s)', (signalAt) => {
  const snapshot = mock.feed.snapshot!;
  snapshot.state.sessions['claude:demo-qd-1']!.stateAt = signalAt;
  const view = render(<VillageApp />);
  expect(view.container.querySelector('[data-session-id="claude:demo-qd-1"]')?.classList.contains('pixel-agent--unknown')).toBe(true);
});

it('opens the owner-mapped project when selecting a mapped session', () => {
  const snapshot = mock.feed.snapshot!;
  snapshot.state.mappings['claude:demo-unmatched'] = { sessionId: 'claude:demo-unmatched', projectId: 'beacon-relay', projectName: 'Beacon Relay', seq: snapshot.seq, occurredAt: snapshot.generatedAt };
  render(<VillageApp />);
  expect(screen.getByRole('button', { name: /scratch-notes/ }).getAttribute('data-project-id')).toBe('beacon-relay');
  fireEvent.click(screen.getByRole('button', { name: /scratch-notes/ }));
  expect(screen.getByRole('heading', { level: 2, name: 'Beacon Relay' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: /Conversation d’origine/ })).toBeTruthy();
});

it('opens a source conversation even when the session has no project', () => {
  render(<VillageApp />);
  fireEvent.click(screen.getByRole('button', { name: /scratch-notes/ }));
  expect(screen.getByRole('heading', { name: /Conversation d’origine/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Fermer le détail' })).toBeTruthy();
});

it('keeps the inbox reachable after every attention item is marked seen', () => {
  const snapshot = mock.feed.snapshot!;
  localStorage.setItem('agent-village:seen', JSON.stringify(buildBoardView(snapshot, Date.parse(snapshot.generatedAt)).attention.map((item) => item.id)));
  render(<VillageApp />);
  fireEvent.click(screen.getByRole('button', { name: 'À toi (0)' }));
  expect(screen.getByRole('heading', { name: /Depuis ta dernière visite/ })).toBeTruthy();
});

it('closes the project detail with Escape', () => {
  render(<VillageApp />);
  fireEvent.click(screen.getByRole('button', { name: /Beacon Relay\. Calme/ }));
  fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' });
  expect(screen.queryByRole('complementary')).toBeNull();
});

it('shows arriving changes while a source detail is frozen for reading', () => {
  const view = render(<VillageApp />);
  fireEvent.click(screen.getByRole('button', { name: /Beacon Relay\. Calme/ }));
  mock.feed = { ...mock.feed, snapshot: { ...mock.feed.snapshot!, seq: mock.feed.snapshot!.seq + 3 } };
  view.rerender(<VillageApp />);
  fireEvent.click(screen.getByRole('button', { name: '3 changements — appliquer' }));
  expect(screen.queryByRole('button', { name: '3 changements — appliquer' })).toBeNull();
});

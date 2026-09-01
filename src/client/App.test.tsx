import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DerivedWorkspace } from '../server/truth/derive.js';
import type { ActivitySnapshot } from '../shared/activity.js';
import { App } from './App.js';

const village: DerivedWorkspace = { version: 1, name: 'Verdant Labs', projects: [{ id: 'atlas', name: 'Atlas', objective: 'Map the valley', effectiveStatus: 'in_progress', features: [], tasks: [{ id: 'map', title: 'Map room', effectiveStatus: 'in_progress', warnings: [], roof: false, subtasks: [] }] }] };

afterEach(() => vi.restoreAllMocks());

function mockApi(activity: ActivitySnapshot) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = String(input);
    const body = path.includes('/api/activity') ? activity : village;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

describe('App degraded activity', () => {
  it('uses a map-first game composition without dashboard panels', async () => {
    mockApi({ status: 'live', fetchedAt: '2026-08-31T16:00:00.000Z', workers: [] });
    const view = render(<App />);
    expect(await screen.findByRole('region', { name: 'Verdant Labs village map' })).toBeTruthy();
    expect(screen.getByRole('banner', { name: 'Village HUD' })).toBeTruthy();
    expect(screen.queryByText('Agents on site')).toBeNull();
    expect(screen.queryByText('Decision queue')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Agent camp' })).toBeNull();
    view.unmount();
  });

  it('keeps buildings visible and renders no workers when activity is degraded', async () => {
    mockApi({ status: 'degraded', fetchedAt: '2026-08-31T16:00:00.000Z', workers: [] });
    const view = render(<App />);
    expect(await screen.findByRole('heading', { name: 'Verdant Labs' })).toBeTruthy();
    expect(await screen.findByText(/Activity unavailable/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Map room. In progress. No owner.' })).toBeTruthy();
    expect(screen.queryByLabelText(/worker,/)).toBeNull();
    view.unmount();
  });

  it('labels truth-only mode without inventing workers', async () => {
    mockApi({ status: 'absent', fetchedAt: '2026-08-31T16:00:00.000Z', workers: [] });
    const view = render(<App />);
    await waitFor(() => expect(screen.getByText('Truth only')).toBeTruthy());
    expect(screen.queryByLabelText(/worker,/)).toBeNull();
    view.unmount();
  });
});

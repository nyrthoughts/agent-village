import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

vi.mock('./hooks/useVillage.js', () => ({
  useVillage: () => ({
    data: {
      version: 1,
      name: 'Test Village',
      progress: { verified: 0, total: 0, remaining: 0 },
      projects: [
        {
          id: 'p1',
          name: 'Test Project',
          objective: 'Build',
          effectiveStatus: 'in_progress',
          progress: { verified: 0, total: 1, remaining: 1 },
          features: [],
          tasks: [],
          observation: {
            lastActivityAt: new Date().toISOString(),
            sessions: [
              {
                id: 's1',
                tool: 'codex',
                state: 'working',
                lastActivityAt: new Date().toISOString(),
                projectKey: 'p1',
                history: [],
                title: 'Build auth',
              },
            ],
          },
        },
      ],
      observation: { fetchedAt: new Date().toISOString(), errors: [], historyWindow: '7d' },
    },
    loading: false,
    error: undefined,
  }),
}));

vi.mock('./hooks/useActivity.js', () => ({
  useActivity: () => ({
    data: { status: 'live', fetchedAt: new Date().toISOString(), workers: [] },
    loading: false,
  }),
}));

describe('App', () => {
  it('renders the village header', () => {
    render(<App />);
    expect(screen.getByText('AGENT VILLAGE')).toBeTruthy();
  });

  it('renders LIVE badge', () => {
    render(<App />);
    expect(screen.getAllByText('LIVE').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Village and Board toggle buttons', () => {
    render(<App />);
    const villageButtons = screen.getAllByText('Village');
    expect(villageButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Board').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the notification panel', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.notif-panel')).toBeTruthy();
  });

  it('renders project buildings', () => {
    render(<App />);
    expect(screen.getAllByText('Test Project').length).toBeGreaterThanOrEqual(1);
  });
});

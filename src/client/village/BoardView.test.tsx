import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardView } from './BoardView.js';
import type { DerivedWorkspace } from '../../server/truth/derive.js';

function makeWorkspace(overrides: Partial<DerivedWorkspace> = {}): DerivedWorkspace {
  return {
    version: 1,
    name: 'Test Village',
    progress: { verified: 0, total: 0, remaining: 0 },
    projects: [],
    observation: { fetchedAt: new Date().toISOString(), errors: [], historyWindow: '7d' },
    ...overrides,
  };
}

describe('BoardView', () => {
  it('renders column headers in French', () => {
    render(<BoardView village={makeWorkspace()} language="fr" now={Date.now()} />);
    expect(screen.getByText('Outil')).toBeTruthy();
    expect(screen.getByText('Projet')).toBeTruthy();
    expect(screen.getByText('Session')).toBeTruthy();
  });

  it('renders column headers in English', () => {
    render(<BoardView village={makeWorkspace()} language="en" now={Date.now()} />);
    expect(screen.getByText('Tool')).toBeTruthy();
    expect(screen.getByText('Project')).toBeTruthy();
  });

  it('shows sessions from projects', () => {
    const now = Date.now();
    const workspace = makeWorkspace({
      projects: [
        {
          id: 'p1',
          name: 'Alpha',
          objective: 'Goal',
          effectiveStatus: 'in_progress',
          progress: { verified: 0, total: 1, remaining: 1 },
          features: [],
          tasks: [],
          observation: {
            lastActivityAt: new Date(now - 1000).toISOString(),
            sessions: [
              {
                id: 's1',
                tool: 'claude',
                state: 'working',
                lastActivityAt: new Date(now - 1000).toISOString(),
                projectKey: 'p1',
                history: [],
                title: 'Claude session',
              },
            ],
          },
        },
      ],
    });

    render(<BoardView village={workspace} language="en" now={now} />);
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Claude session')).toBeTruthy();
  });
});

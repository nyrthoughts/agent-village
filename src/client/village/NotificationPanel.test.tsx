import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationPanel } from './NotificationPanel.js';
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

describe('NotificationPanel', () => {
  it('renders the panel title in French', () => {
    render(
      <NotificationPanel
        village={makeWorkspace()}
        now={Date.now()}
        language="fr"
      />,
    );
    expect(screen.getByText('\u00C0 toi')).toBeTruthy();
  });

  it('renders the panel title in English', () => {
    render(
      <NotificationPanel
        village={makeWorkspace()}
        now={Date.now()}
        language="en"
      />,
    );
    expect(screen.getByText('For you')).toBeTruthy();
  });

  it('shows empty message when no sessions', () => {
    render(
      <NotificationPanel
        village={makeWorkspace()}
        now={Date.now()}
        language="fr"
      />,
    );
    expect(screen.getAllByText('Aucun signal récent').length).toBeGreaterThanOrEqual(1);
  });

  it('shows entries for projects with sessions', () => {
    const now = Date.now();
    const workspace = makeWorkspace({
      projects: [
        {
          id: 'p1',
          name: 'Project Alpha',
          objective: 'Build something',
          effectiveStatus: 'in_progress',
          progress: { verified: 0, total: 1, remaining: 1 },
          features: [],
          tasks: [],
          observation: {
            lastActivityAt: new Date(now - 60_000).toISOString(),
            sessions: [
              {
                id: 's1',
                tool: 'codex',
                state: 'working',
                lastActivityAt: new Date(now - 60_000).toISOString(),
                projectKey: 'p1',
                history: [
                  { at: new Date(now - 60_000).toISOString(), kind: 'report', text: 'Refactored the auth module.' },
                ],
                activityEvidence: { level: 'confirmed', source: 'codex-index', observedAt: new Date(now - 10_000).toISOString() },
              },
            ],
          },
        },
      ],
    });

    render(
      <NotificationPanel
        village={workspace}
        now={now}
        language="fr"
      />,
    );
    expect(screen.getByText(/Codex/)).toBeTruthy();
  });
});

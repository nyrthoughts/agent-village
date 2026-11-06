import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationPanel } from './NotificationPanel.js';
import type { DerivedWorkspace } from '../../server/truth/derive.js';

function makeWorkspace(overrides: Partial<DerivedWorkspace> = {}): DerivedWorkspace {
  return {
    version: 1, name: 'Test Village',
    progress: { verified: 0, total: 0, remaining: 0 }, projects: [],
    observation: { fetchedAt: new Date().toISOString(), errors: [], historyWindow: '7d' },
    ...overrides,
  };
}

describe('NotificationPanel', () => {
  it('renders panel title in French', () => {
    render(<NotificationPanel village={makeWorkspace()} now={Date.now()} language="fr" />);
    expect(screen.getByText('\u00C0 toi')).toBeTruthy();
  });

  it('renders panel title in English', () => {
    render(<NotificationPanel village={makeWorkspace()} now={Date.now()} language="en" />);
    expect(screen.getByText('For you')).toBeTruthy();
  });

  it('shows demo badge when isDemoMode is true', () => {
    const { container } = render(
      <NotificationPanel village={makeWorkspace()} now={Date.now()} language="fr" isDemoMode={true} />,
    );
    expect(container.querySelector('.notif-panel__demo-badge')).toBeTruthy();
  });

  it('shows empty message when no sessions', () => {
    render(<NotificationPanel village={makeWorkspace()} now={Date.now()} language="fr" />);
    expect(screen.getAllByText('Aucun signal r\u00E9cent').length).toBeGreaterThanOrEqual(1);
  });
});

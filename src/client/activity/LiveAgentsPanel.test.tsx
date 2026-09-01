import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { LiveAgentsPanel } from './LiveAgentsPanel.js';

const activity: ActivitySnapshot = {
  status: 'live',
  fetchedAt: '2026-09-01T12:00:00.000Z',
  workers: [
    { id: 'codex:1', tool: 'codex', state: 'working', project: 'agent-village', title: 'Publish and connect', lastActivityAt: '2026-09-01T12:00:00.000Z' },
    { id: 'claude:1', tool: 'claude', state: 'waiting', project: 'atlas', title: 'Review Atlas', attachedTaskId: 'atlas-review', lastActivityAt: '2026-09-01T11:59:00.000Z' },
  ],
};

describe('LiveAgentsPanel', () => {
  it('shows every conversation, its project, tool, state and building mapping', () => {
    render(<LiveAgentsPanel activity={activity} />);

    expect(screen.getByRole('region', { name: 'Live conversations' })).toBeTruthy();
    expect(screen.getByText('Publish and connect')).toBeTruthy();
    expect(screen.getByText('agent-village')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('Working')).toBeTruthy();
    expect(screen.getByText('Building: atlas-review')).toBeTruthy();
    expect(screen.getByText('Unmapped')).toBeTruthy();
  });

  it('does not render outside live activity mode', () => {
    const { container } = render(<LiveAgentsPanel activity={{ ...activity, status: 'demo' }} />);
    expect(container.firstChild).toBeNull();
  });
});

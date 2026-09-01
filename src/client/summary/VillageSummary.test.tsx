import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { VillageSummary } from './VillageSummary.js';

const village: DerivedWorkspace = {
  version: 1,
  name: 'Verdant Labs',
  projects: [{
    id: 'atlas', name: 'Atlas', objective: 'Map it', effectiveStatus: 'blocked', features: [],
    tasks: [
      { id: 'done', title: 'Done', effectiveStatus: 'verified', roof: true, warnings: [], subtasks: [] },
      { id: 'blocked', title: 'Blocked', effectiveStatus: 'blocked', roof: false, warnings: [], subtasks: [] },
      { id: 'review', title: 'Review', effectiveStatus: 'awaiting_review', roof: false, warnings: [], subtasks: [] },
      { id: 'active', title: 'Active', effectiveStatus: 'in_progress', roof: false, warnings: [], subtasks: [] },
    ],
  }],
};
const activity: ActivitySnapshot = {
  status: 'live', fetchedAt: '2026-09-01T12:00:00.000Z',
  workers: [{ id: 'codex:1', tool: 'codex', state: 'working', lastActivityAt: '2026-09-01T12:00:00.000Z' }],
};

describe('VillageSummary', () => {
  it('shows completion, active agents and attention load at a glance', () => {
    render(<VillageSummary village={village} activity={activity} />);
    expect(screen.getByText('1 / 4')).toBeTruthy();
    expect(screen.getByText('25% built')).toBeTruthy();
    expect(screen.getByText('1 active')).toBeTruthy();
    expect(screen.getByText('2 need attention')).toBeTruthy();
  });
});

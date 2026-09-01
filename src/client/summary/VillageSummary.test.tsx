import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { VillageSummary } from './VillageSummary.js';

const village: DerivedWorkspace = {
  version: 1,
  name: 'Verdant Labs',
  progress: { verified: 1, total: 4, remaining: 3 },
  projects: [{
    id: 'atlas', name: 'Atlas', objective: 'Map it', effectiveStatus: 'blocked', progress: { verified: 1, total: 4, remaining: 3 }, features: [],
    tasks: [
      { id: 'done', title: 'Done', effectiveStatus: 'verified', roof: true, progress: { stage: 'complete', stageIndex: 5, verified: 1, total: 1, remaining: 0 }, warnings: [], subtasks: [] },
      { id: 'blocked', title: 'Blocked', effectiveStatus: 'blocked', roof: false, progress: { stage: 'foundation', stageIndex: 1, verified: 0, total: 1, remaining: 1 }, warnings: [], subtasks: [] },
      { id: 'review', title: 'Review', effectiveStatus: 'awaiting_review', roof: false, progress: { stage: 'foundation', stageIndex: 1, verified: 0, total: 1, remaining: 1 }, warnings: [], subtasks: [] },
      { id: 'active', title: 'Active', effectiveStatus: 'in_progress', roof: false, progress: { stage: 'foundation', stageIndex: 1, verified: 0, total: 1, remaining: 1 }, warnings: [], subtasks: [] },
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

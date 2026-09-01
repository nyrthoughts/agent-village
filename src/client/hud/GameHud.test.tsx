import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { GameHud } from './GameHud.js';

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
  workers: [
    { id: 'codex:1', tool: 'codex', state: 'working', project: 'agent-village', title: 'Build the village', lastActivityAt: '2026-09-01T12:00:00.000Z' },
    { id: 'claude:1', tool: 'claude', state: 'waiting', project: 'atlas', title: 'Review Atlas', lastActivityAt: '2026-09-01T11:59:00.000Z' },
  ],
};

describe('GameHud', () => {
  it('turns village truth and agent activity into a compact game HUD', () => {
    render(<GameHud village={village} activity={activity} />);
    expect(screen.getByRole('banner', { name: 'Village HUD' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Verdant Labs' })).toBeTruthy();
    expect(screen.getByText('1 of 4 built')).toBeTruthy();
    expect(screen.getByText('2 alerts')).toBeTruthy();
    expect(screen.getByText('Build the village')).toBeTruthy();
    expect(screen.getByText('Review Atlas')).toBeTruthy();
  });
});

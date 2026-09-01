import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { GameHud } from './GameHud.js';

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
  workers: [
    { id: 'codex:1', tool: 'codex', state: 'working', project: 'agent-village', title: 'Build the village', lastActivityAt: '2026-09-01T12:00:00.000Z' },
    { id: 'claude:1', tool: 'claude', state: 'waiting', project: 'atlas', title: 'Review Atlas', lastActivityAt: '2026-09-01T11:59:00.000Z' },
  ],
};

describe('GameHud', () => {
  it('turns village truth and agent activity into a compact game HUD', () => {
    render(<GameHud village={village} activity={activity} />);
    expect(screen.getByRole('banner', { name: 'Village HUD' }).getAttribute('data-ui-style')).toBe('pixel-window');
    expect(screen.getByRole('banner', { name: 'Village HUD' }).querySelector('.game-hud__village')?.getAttribute('data-layout')).toBe('location-plaque');
    expect(screen.getByRole('region', { name: 'Agents in village' }).getAttribute('data-layout')).toBe('sprite-strip');
    expect(screen.getByRole('heading', { name: 'Verdant Labs' })).toBeTruthy();
    expect(screen.getByText('1 of 4 built')).toBeTruthy();
    expect(screen.getByText('2 alerts')).toBeTruthy();
    expect(screen.getByText('Build the village')).toBeTruthy();
    expect(screen.getByText('Review Atlas')).toBeTruthy();
  });
});

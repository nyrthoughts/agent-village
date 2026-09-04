import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { VillageTable } from './VillageTable.js';

const task = (id: string, status: DerivedTask['effectiveStatus']): DerivedTask => ({ id, title: id, effectiveStatus: status, warnings: [], roof: status === 'verified', progress: { stage: status === 'verified' ? 'complete' : 'foundation', stageIndex: status === 'verified' ? 5 : 1, verified: status === 'verified' ? 1 : 0, total: 1, remaining: status === 'verified' ? 0 : 1 }, subtasks: [] });
const project = (id: string): DerivedProject => ({ id, name: id.toUpperCase(), objective: `${id} objective`, effectiveStatus: 'in_progress', progress: { verified: 1, total: 2, remaining: 1 }, features: [{ id: `${id}-feature`, title: `${id} compound`, effectiveStatus: 'in_progress', progress: { verified: 0, total: 1, remaining: 1 }, tasks: [task(`${id}-nested`, 'in_progress')] }], tasks: [task(`${id}-standalone`, 'verified')] });
const village: DerivedWorkspace = { version: 1, name: 'Verdant Labs', progress: { verified: 2, total: 4, remaining: 2 }, projects: [project('atlas'), project('beacon')] };
const activity: ActivitySnapshot = { status: 'demo', fetchedAt: '2026-08-31T16:00:00.000Z', workers: [
  { id: 'c', tool: 'codex', state: 'working', attachedTaskId: 'atlas-nested', lastActivityAt: '2026-08-31T15:00:00.000Z' },
  { id: 'x', tool: 'claude', state: 'waiting', attachedTaskId: 'beacon-nested', lastActivityAt: '2026-08-31T15:00:00.000Z' },
  { id: 'o', tool: 'openclaw', state: 'working', lastActivityAt: '2026-08-31T15:00:00.000Z' },
] };

describe('VillageTable', () => {
  it('composes districts, feature compounds, standalone buildings and workers', () => {
    render(<VillageTable village={village} activity={activity} onSelect={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'ATLAS' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'BEACON' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'atlas compound' })).toBeTruthy();
    expect(screen.getAllByText('Open yard')).toHaveLength(2);
    expect(screen.getByLabelText('codex worker, working')).toBeTruthy();
    expect(screen.getByLabelText('claude worker, waiting')).toBeTruthy();
    expect(screen.getByLabelText('Unassigned workers')).toBeTruthy();
    expect(screen.getByLabelText('openclaw worker, working')).toBeTruthy();
  });
});

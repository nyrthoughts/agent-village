import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import { AttentionList } from './AttentionList.js';

const task = (id: string, status: DerivedTask['effectiveStatus']): DerivedTask => ({ id, title: id, effectiveStatus: status, warnings: [], roof: status === 'verified', progress: { stage: status === 'verified' ? 'complete' : 'foundation', stageIndex: status === 'verified' ? 5 : 1, verified: status === 'verified' ? 1 : 0, total: 1, remaining: status === 'verified' ? 0 : 1 }, subtasks: [] });
const village: DerivedWorkspace = { version: 1, name: 'Test', progress: { verified: 1, total: 4, remaining: 3 }, projects: [{ id: 'p', name: 'Project', objective: 'Objective', effectiveStatus: 'blocked', progress: { verified: 1, total: 4, remaining: 3 }, features: [], tasks: [task('verified', 'verified'), task('blocked', 'blocked'), task('review', 'awaiting_review'), task('active', 'in_progress')] }] };

describe('AttentionList', () => {
  it('orders by attention and sends the same task selection contract', () => {
    const onSelect = vi.fn();
    render(<AttentionList village={village} onSelect={onSelect} />);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('blocked'), expect.stringContaining('review'), expect.stringContaining('active'),
    ]);
    expect(screen.queryByText('verified')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /blocked/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'blocked' }), expect.any(HTMLButtonElement), expect.objectContaining({ id: 'p' }));
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import { AttentionList } from './AttentionList.js';

const task = (id: string, status: DerivedTask['effectiveStatus']): DerivedTask => ({ id, title: id, effectiveStatus: status, warnings: [], roof: false, subtasks: [] });
const village: DerivedWorkspace = { version: 1, name: 'Test', projects: [{ id: 'p', name: 'Project', objective: 'Objective', effectiveStatus: 'blocked', features: [], tasks: [task('verified', 'verified'), task('blocked', 'blocked'), task('review', 'awaiting_review'), task('active', 'in_progress')] }] };

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

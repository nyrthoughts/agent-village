import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DerivedTask } from '../../server/truth/derive.js';
import { Building } from './Building.js';
import { buildingLayout } from './buildingLayout.js';

function task(overrides: Partial<DerivedTask>): DerivedTask {
  return {
    id: 'task',
    title: 'Map room',
    effectiveStatus: 'in_progress',
    warnings: [],
    roof: false,
    progress: { stage: 'foundation', stageIndex: 1, verified: 0, total: 1, remaining: 1 },
    subtasks: [],
    ...overrides,
  };
}

describe('building grammar', () => {
  it('maps verified, active and planned floors to material, frame and blueprint', () => {
    const spec = buildingLayout(task({
      subtasks: [
        { id: 'a', title: 'A', effectiveStatus: 'verified', warnings: [] },
        { id: 'b', title: 'B', effectiveStatus: 'in_progress', warnings: [] },
        { id: 'c', title: 'C', effectiveStatus: 'planned', warnings: [] },
      ],
    }));
    expect(spec.floors.map((floor) => floor.visual)).toEqual(['material', 'frame', 'blueprint']);
  });

  it('renders scaffold, flag and roof from derived truth', () => {
    const { rerender } = render(<Building task={task({ effectiveStatus: 'blocked' })} />);
    expect(screen.getByTestId('blocked-scaffold')).toBeTruthy();

    rerender(<Building task={task({ effectiveStatus: 'awaiting_review' })} />);
    expect(screen.getByTestId('review-flag')).toBeTruthy();

    rerender(<Building task={task({ effectiveStatus: 'verified', roof: true })} />);
    expect(screen.getByTestId('verified-roof')).toBeTruthy();
  });

  it('is keyboard focusable, textual and selectable', () => {
    const onSelect = vi.fn();
    render(<Building task={task({ owner: 'Mira' })} onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: /Map room\. In progress\. Owner Mira/i });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'task' }), button);
  });
});

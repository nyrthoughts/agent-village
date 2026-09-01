import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';
import { PixelBuilding } from './PixelBuilding.js';

function task(overrides: Partial<DerivedTask> = {}): DerivedTask {
  return { id: 'task', title: 'Contour studio', owner: 'Mira', effectiveStatus: 'in_progress', warnings: [], roof: false, progress: { stage: 'foundation', stageIndex: 1, verified: 0, total: 1, remaining: 1 }, subtasks: [], ...overrides };
}

const project: DerivedProject = { id: 'atlas', name: 'Atlas', objective: 'Map it', effectiveStatus: 'in_progress', progress: { verified: 0, total: 0, remaining: 0 }, features: [], tasks: [] };

afterEach(cleanup);

describe('PixelBuilding', () => {
  it('maps task truth to an original pixel construction variant', () => {
    render(<PixelBuilding task={task()} project={project} variant={1} onSelect={() => undefined} />);
    const building = screen.getByRole('button', { name: 'Contour studio. In progress. Owner Mira.' });
    expect(building.getAttribute('data-building-variant')).toBe('construction');
    expect(building.getAttribute('data-roof-palette')).toBe('1');
    expect(building.getAttribute('data-sprite-scale')).toBe('compact');
  });

  it('distinguishes all five construction states without changing task truth', () => {
    const { rerender } = render(<PixelBuilding task={task({ effectiveStatus: 'planned' })} project={project} variant={0} onSelect={() => undefined} />);
    expect(screen.getByTestId('pixel-building-task').getAttribute('data-building-variant')).toBe('plot');
    rerender(<PixelBuilding task={task({ effectiveStatus: 'blocked' })} project={project} variant={0} onSelect={() => undefined} />);
    expect(screen.getByTestId('pixel-building-task').getAttribute('data-building-variant')).toBe('blocked');
    rerender(<PixelBuilding task={task({ effectiveStatus: 'awaiting_review' })} project={project} variant={0} onSelect={() => undefined} />);
    expect(screen.getByTestId('pixel-building-task').getAttribute('data-building-variant')).toBe('review');
    rerender(<PixelBuilding task={task({ effectiveStatus: 'verified', roof: true })} project={project} variant={0} onSelect={() => undefined} />);
    expect(screen.getByTestId('pixel-building-task').getAttribute('data-building-variant')).toBe('complete');
    expect(screen.getByTestId('pixel-building-task').querySelector('.pixel-building__porch')).toBeTruthy();
  });

  it('opens the existing task context with the semantic button as trigger', () => {
    const onSelect = vi.fn();
    render(<PixelBuilding task={task()} project={project} variant={0} onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: /Contour studio/ });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'task' }), button, project);
  });
});

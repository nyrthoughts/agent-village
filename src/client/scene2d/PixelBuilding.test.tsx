import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';
import { PixelBuilding } from './PixelBuilding.js';
import { BUILDING_FAMILIES } from './buildingFamilies.js';
import { CONSTRUCTION_STAGES } from '../../shared/statuses.js';

function task(overrides: Partial<DerivedTask> = {}): DerivedTask {
  return { id: 'task', title: 'Contour studio', owner: 'Mira', effectiveStatus: 'in_progress', warnings: [], roof: false, progress: { stage: 'foundation', stageIndex: 1, verified: 0, total: 1, remaining: 1 }, subtasks: [], ...overrides };
}

const project: DerivedProject = { id: 'atlas', name: 'Atlas', objective: 'Map it', effectiveStatus: 'in_progress', progress: { verified: 0, total: 0, remaining: 0 }, features: [], tasks: [] };
const nativeProject: DerivedProject = {
  ...project,
  observation: { sessions: [], lastActivityAt: '2026-09-04T12:00:00Z', buildingFamilyIndex: 0 },
  plan: { objective: 'Map it', revision: 1, updatedAt: '2026-09-04T12:00:00Z', milestones: [{ id: 'map', title: 'Map', validated: false, note: '' }] },
};

afterEach(cleanup);

describe('PixelBuilding', () => {
  it('maps task truth to an original pixel construction variant', () => {
    render(<PixelBuilding task={task()} project={project} variant={1} onSelect={() => undefined} />);
    const building = screen.getByRole('button', { name: 'Contour studio. In progress. Owner Mira.' });
    expect(building.getAttribute('data-building-variant')).toBe('construction');
    expect(building.getAttribute('data-roof-palette')).toBe('1');
    expect(building.getAttribute('data-sprite-scale')).toBe('compact');
    expect(building.getAttribute('data-stage')).toBe('foundation');
    expect(building.getAttribute('data-family')).toBeTruthy();
  });

  it('renders the server-derived construction stage independently from status', () => {
    render(<PixelBuilding task={task({ effectiveStatus: 'blocked', progress: { stage: 'frame', stageIndex: 2, verified: 1, total: 3, remaining: 2 } })} project={project} variant={0} onSelect={() => undefined} />);
    const building = screen.getByTestId('pixel-building-task');
    expect(building.getAttribute('data-building-variant')).toBe('blocked');
    expect(building.getAttribute('data-stage')).toBe('frame');
  });

  it('distinguishes all five construction states without changing task truth', () => {
    const { rerender } = render(<PixelBuilding task={task({ effectiveStatus: 'planned' })} project={project} variant={0} onSelect={() => undefined} />);
    expect(screen.getByTestId('pixel-building-task').getAttribute('data-building-variant')).toBe('plot');
    rerender(<PixelBuilding task={task({ effectiveStatus: 'blocked' })} project={project} variant={0} onSelect={() => undefined} />);
    expect(screen.getByTestId('pixel-building-task').getAttribute('data-building-variant')).toBe('blocked');
    rerender(<PixelBuilding task={task({ effectiveStatus: 'awaiting_review' })} project={project} variant={0} onSelect={() => undefined} />);
    expect(screen.getByTestId('pixel-building-task').getAttribute('data-building-variant')).toBe('review');
    rerender(<PixelBuilding task={task({ effectiveStatus: 'verified', roof: true, progress: { stage: 'complete', stageIndex: 5, verified: 1, total: 1, remaining: 0 } })} project={project} variant={0} onSelect={() => undefined} />);
    expect(screen.getByTestId('pixel-building-task').getAttribute('data-building-variant')).toBe('complete');
    expect(screen.getByTestId('pixel-building-task').querySelector('[data-building-layer="finish"]')).toBeTruthy();
  });

  it.each(CONSTRUCTION_STAGES)('physically constructs %s in both native and demo, without completed layers leaking', (stage) => {
    const stageIndex = CONSTRUCTION_STAGES.indexOf(stage);
    for (const context of [project, nativeProject]) {
      const { container, unmount } = render(<PixelBuilding task={task({ progress: { stage, stageIndex, verified: stageIndex, total: 5, remaining: 5 - stageIndex } })} project={context} variant={0} onSelect={() => undefined} />);
      expect(container.querySelector('button')?.getAttribute('data-stage')).toBe(stage);
      expect(Boolean(container.querySelector('[data-building-layer="foundation"]'))).toBe(stageIndex >= 1);
      expect(Boolean(container.querySelector('[data-building-layer="frame"]'))).toBe(stageIndex === 2);
      expect(Boolean(container.querySelector('[data-building-layer="walls"]'))).toBe(stageIndex >= 3);
      expect(Boolean(container.querySelector('[data-building-layer="roof"]'))).toBe(stageIndex >= 4);
      expect(Boolean(container.querySelector('[data-building-layer="finish"]'))).toBe(stageIndex === 5);
      unmount();
    }
  });

  it.each(['en', 'fr'] as const)('shows an explicit survey, never a finished house, for undefined progress (%s)', (language) => {
    const { container } = render(<PixelBuilding language={language} task={task({ effectiveStatus: 'verified', roof: true, progress: { stage: 'complete', stageIndex: 5, verified: 0, total: 0, remaining: 0 } })} project={nativeProject} variant={0} onSelect={() => undefined} />);
    expect(container.querySelector('button')?.getAttribute('data-stage')).toBe('survey');
    expect(container.querySelector('[data-building-layer="survey"]')).toBeTruthy();
    expect(container.querySelector('[data-building-layer="roof"]')).toBeNull();
    expect(container.querySelector('[data-building-layer="finish"]')).toBeNull();
    expect(container.querySelector('button')?.getAttribute('aria-label')).toContain(language === 'en' ? 'Plan not defined' : 'Plan à définir');
  });

  it('does not turn legacy native progress into a house when no owner plan exists', () => {
    const { container } = render(<PixelBuilding task={task()} project={{ ...nativeProject, plan: undefined }} variant={0} onSelect={() => undefined} />);
    expect(container.querySelector('button')?.getAttribute('data-stage')).toBe('survey');
    expect(container.querySelector('[data-building-layer="foundation"]')).toBeNull();
  });

  it('draws six different architectural outlines, not six color replacements', () => {
    const outlines = BUILDING_FAMILIES.map((family) => {
      const { container, unmount } = render(<PixelBuilding task={task({ progress: { stage: 'complete', stageIndex: 5, verified: 1, total: 1, remaining: 0 } })} project={{ ...nativeProject, observation: { ...nativeProject.observation!, buildingFamilyIndex: family.index } }} variant={family.index} onSelect={() => undefined} />);
      expect(container.querySelector('button')?.getAttribute('data-family')).toBe(family.id);
      const outline = container.querySelector('[data-architecture-outline]')?.getAttribute('d');
      expect(outline).toBeTruthy();
      unmount();
      return outline;
    });
    expect(new Set(outlines).size).toBe(6);
  });

  it('opens the existing task context with the semantic button as trigger', () => {
    const onSelect = vi.fn();
    render(<PixelBuilding task={task()} project={project} variant={0} onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: /Contour studio/ });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'task' }), button, project);
  });
});

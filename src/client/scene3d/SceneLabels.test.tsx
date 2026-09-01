import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import { SceneLabels } from './SceneLabels.js';

const task: DerivedTask = {
  id: 'atlas-bridge',
  title: 'Timber bridge',
  owner: 'Jo',
  effectiveStatus: 'blocked',
  warnings: [],
  roof: false,
  subtasks: [],
};
const village: DerivedWorkspace = {
  version: 1,
  name: 'Verdant Labs',
  projects: [{
    id: 'atlas',
    name: 'Atlas',
    objective: 'Cross the river',
    effectiveStatus: 'blocked',
    features: [],
    tasks: [task],
  }],
};

afterEach(cleanup);

describe('SceneLabels', () => {
  it('keeps every building textual, keyboard focusable and selection-compatible', () => {
    const onSelect = vi.fn();
    const onFocusTask = vi.fn();
    render(<SceneLabels
      village={village}
      positions={{ 'atlas-bridge': { x: 320, y: 180, visible: true } }}
      onSelect={onSelect}
      onFocusTask={onFocusTask}
    />);

    const button = screen.getByRole('button', { name: /Timber bridge.*Blocked.*Owner Jo/i });
    expect(screen.getByText('Atlas')).toBeTruthy();
    expect(button.getAttribute('style')).toContain('translate3d(320px, 180px, 0)');
    fireEvent.focus(button);
    expect(onFocusTask).toHaveBeenCalledWith('atlas-bridge', true);
    fireEvent.blur(button);
    expect(onFocusTask).toHaveBeenCalledWith('atlas-bridge', false);
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'atlas-bridge' }),
      button,
      expect.objectContaining({ id: 'atlas' }),
    );
  });

  it('keeps off-camera tasks in the accessibility tree without painting their plaque', () => {
    render(<SceneLabels
      village={village}
      positions={{ 'atlas-bridge': { x: -20, y: 0, visible: false } }}
      onSelect={vi.fn()}
      onFocusTask={vi.fn()}
    />);

    const button = screen.getByRole('button', { name: /Timber bridge/i });
    expect(button.getAttribute('data-visible')).toBe('false');
  });
});

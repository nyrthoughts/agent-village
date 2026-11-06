import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PipelineDots, projectStages } from './PipelineDots.js';
import type { ObservedSession } from '../../shared/observation.js';

function makeSession(overrides: Partial<ObservedSession> = {}): ObservedSession {
  return {
    id: 'session-1',
    tool: 'codex',
    state: 'working',
    lastActivityAt: new Date().toISOString(),
    projectKey: 'proj-1',
    history: [],
    ...overrides,
  };
}

describe('projectStages', () => {
  it('always includes declared', () => {
    const result = projectStages([makeSession({ state: 'idle', history: [] })]);
    expect(result.has('declared')).toBe(true);
  });

  it('includes activity for working sessions', () => {
    const result = projectStages([makeSession({ state: 'working' })]);
    expect(result.has('activity')).toBe(true);
  });

  it('includes commit when history mentions commit', () => {
    const result = projectStages([
      makeSession({
        history: [{ at: new Date().toISOString(), kind: 'report', text: 'Pushed commit abc123' }],
      }),
    ]);
    expect(result.has('commit')).toBe(true);
  });

  it('includes CI when history mentions CI', () => {
    const result = projectStages([
      makeSession({
        history: [{ at: new Date().toISOString(), kind: 'report', text: 'CI tests passed' }],
      }),
    ]);
    expect(result.has('CI')).toBe(true);
  });

  it('includes merge when history mentions merged', () => {
    const result = projectStages([
      makeSession({
        history: [{ at: new Date().toISOString(), kind: 'report', text: 'PR merged into main' }],
      }),
    ]);
    expect(result.has('merge')).toBe(true);
  });

  it('includes deploy when history mentions deploy', () => {
    const result = projectStages([
      makeSession({
        history: [{ at: new Date().toISOString(), kind: 'report', text: 'Deployed v1.0.3 to production' }],
      }),
    ]);
    expect(result.has('deploy')).toBe(true);
  });
});

describe('PipelineDots', () => {
  it('renders all six stage labels', () => {
    render(<PipelineDots sessions={[]} language="en" />);
    expect(screen.getByText('declared')).toBeTruthy();
    expect(screen.getByText('activity')).toBeTruthy();
    expect(screen.getByText('commit')).toBeTruthy();
    expect(screen.getByText('CI')).toBeTruthy();
    expect(screen.getByText('merge')).toBeTruthy();
    expect(screen.getByText('deploy')).toBeTruthy();
  });

  it('marks active stages with the active class', () => {
    const { container } = render(
      <PipelineDots sessions={[makeSession({ state: 'working' })]} language="fr" />,
    );
    const dots = container.querySelectorAll('.pipeline-dot__circle');
    expect(dots[0]?.classList.contains('pipeline-dot__circle--active')).toBe(true);
    expect(dots[1]?.classList.contains('pipeline-dot__circle--active')).toBe(true);
  });
});

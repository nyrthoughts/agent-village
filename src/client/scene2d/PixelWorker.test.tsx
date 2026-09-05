import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Worker } from '../../shared/activity.js';
import { PixelWorker } from './PixelWorker.js';

afterEach(cleanup);

function worker(overrides: Partial<Worker> = {}): Worker {
  return { id: 'worker', tool: 'codex', role: 'lead', state: 'working', title: 'Build contours', lastActivityAt: '2026-09-01T12:00:00.000Z', ...overrides };
}

describe('PixelWorker', () => {
  it('renders an original tool-colored worker sprite and live state', () => {
    render(<PixelWorker worker={worker()} />);
    const sprite = screen.getByRole('button', { name: 'Codex lead agent, working, Build contours' });
    expect(sprite.className).toContain('pixel-worker--codex');
    expect(sprite.className).toContain('pixel-worker--working');
    expect(sprite.getAttribute('data-sprite-origin')).toBe('original');
  });

  it('shows waiting state without borrowing game characters', () => {
    render(<PixelWorker worker={worker({ tool: 'claude', state: 'waiting', title: 'Review Atlas' })} />);
    expect(screen.getByRole('button', { name: 'Claude lead agent, waiting, Review Atlas' })).toBeTruthy();
    expect(screen.getByTestId('worker-bubble').textContent).toBe('…');
    expect(screen.queryByText('Pokémon')).toBeNull();
  });

  it('renders helpers as smaller people and keeps them clickable', () => {
    const onSelect = vi.fn();
    render(<PixelWorker worker={worker({ role: 'helper' })} onSelect={onSelect} />);
    const person = screen.getByRole('button', { name: 'Codex helper agent, working, Build contours' });
    expect(person.className).toContain('pixel-worker--helper');
    fireEvent.click(person);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'worker' }), person);
  });

  it('distinguishes observed helpers from confirmed working helpers', () => {
    render(<PixelWorker worker={worker()} helperCount={3} confirmedHelperCount={1} />);
    expect(screen.getByRole('button', { name: 'Codex lead agent, working, Build contours, 3 observed helpers, 1 confirmed working' })).toBeTruthy();
  });

  it('never labels recent evidence as confirmed work and translates worker copy', () => {
    render(<PixelWorker language="fr" worker={worker({ state: 'working', activityEvidence: { level: 'recent', source: 'codex-index', observedAt: '2026-09-04T12:00:00Z' } })} />);
    const person = screen.getByRole('button', { name: 'Agent principal Codex, Activité récente, Build contours' });
    expect(person.className).toContain('pixel-worker--unknown');
    expect(person.getAttribute('data-activity-evidence')).toBe('recent');
  });
});

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

  it('renders helpers as smaller people, shows their group count and stays clickable', () => {
    const onSelect = vi.fn();
    render(<PixelWorker worker={worker({ role: 'helper' })} helperCount={3} onSelect={onSelect} />);
    const person = screen.getByRole('button', { name: 'Codex helper agent, working, Build contours' });
    expect(person.className).toContain('pixel-worker--helper');
    expect(screen.getByLabelText('3 helper agents')).toBeTruthy();
    fireEvent.click(person);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'worker' }), person);
  });
});

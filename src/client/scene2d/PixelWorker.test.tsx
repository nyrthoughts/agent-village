import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Worker } from '../../shared/activity.js';
import { PixelWorker } from './PixelWorker.js';

afterEach(cleanup);

function worker(overrides: Partial<Worker> = {}): Worker {
  return { id: 'worker', tool: 'codex', state: 'working', title: 'Build contours', lastActivityAt: '2026-09-01T12:00:00.000Z', ...overrides };
}

describe('PixelWorker', () => {
  it('renders an original tool-colored worker sprite and live state', () => {
    render(<PixelWorker worker={worker()} />);
    const sprite = screen.getByLabelText('Codex worker, working, Build contours');
    expect(sprite.className).toContain('pixel-worker--codex');
    expect(sprite.className).toContain('pixel-worker--working');
    expect(sprite.getAttribute('data-sprite-origin')).toBe('original');
  });

  it('shows waiting state without borrowing game characters', () => {
    render(<PixelWorker worker={worker({ tool: 'claude', state: 'waiting', title: 'Review Atlas' })} />);
    expect(screen.getByLabelText('Claude worker, waiting, Review Atlas')).toBeTruthy();
    expect(screen.getByTestId('worker-bubble').textContent).toBe('…');
    expect(screen.queryByText('Pokémon')).toBeNull();
  });
});

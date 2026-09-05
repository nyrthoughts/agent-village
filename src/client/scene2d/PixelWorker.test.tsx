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
    const person = screen.getByRole('button', { name: 'Agent principal Codex, État non confirmé · Activité récente, Build contours' });
    expect(person.className).toContain('pixel-worker--unknown');
    expect(person.getAttribute('data-activity-evidence')).toBe('recent');
  });

  it('does not animate or announce native work without evidence', () => {
    render(<PixelWorker native worker={worker()} helperCount={3} confirmedHelperCount={0} />);
    const person = screen.getByRole('button', { name: 'Codex lead agent, Unconfirmed state, Build contours, 3 observed helpers, 0 confirmed working' });
    expect(person.className).toContain('pixel-worker--unknown');
    expect(person.className).not.toContain('pixel-worker--working');
  });

  it.each([
    ['recent', 'recent', 1000],
    ['stale', 'confirmed', 120_001],
    ['future', 'confirmed', -60_000],
  ] as const)('does not animate native work with %s evidence', (_label, level, age) => {
    render(<PixelWorker native worker={worker({ activityEvidence: { level, source: 'claude-process', observedAt: new Date(Date.now() - age).toISOString() } })} />);
    const person = screen.getByRole('button', { name: /Unconfirmed state/ });
    expect(person.className).toContain('pixel-worker--unknown');
    expect(person.className).not.toContain('pixel-worker--working');
  });

  it('animates only fresh confirmed native work', () => {
    render(<PixelWorker native worker={worker({ activityEvidence: { level: 'confirmed', source: 'claude-process', observedAt: new Date(Date.now() - 1000).toISOString() } })} />);
    expect(screen.getByRole('button', { name: 'Codex lead agent, working, Build contours' }).className).toContain('pixel-worker--working');
  });

  it('expires confirmed work when the clock advances without a new worker snapshot', () => {
    const now = Date.now();
    const unchanged = worker({ activityEvidence: { level: 'confirmed', source: 'claude-process', observedAt: new Date(now).toISOString() } });
    const view = render(<PixelWorker native now={now} worker={unchanged} />);
    expect(screen.getByRole('button').className).toContain('pixel-worker--working');
    view.rerender(<PixelWorker native now={now + 120_001} worker={unchanged} />);
    const person = screen.getByRole('button', { name: 'Codex lead agent, Unconfirmed state, Build contours' });
    expect(person.className).toContain('pixel-worker--unknown');
    expect(person.className).not.toContain('pixel-worker--working');
  });

  it.each(['waiting', 'idle'] as const)('keeps a resting %s pose for recent native observations', (state) => {
    render(<PixelWorker native worker={worker({ state, activityEvidence: { level: 'recent', source: 'claude-hook', observedAt: new Date().toISOString() } })} />);
    const person = screen.getByRole('button', { name: `Codex lead agent, ${state === 'waiting' ? 'waiting' : 'No recent activity'}, Build contours` });
    expect(person.className).toContain(`pixel-worker--${state}`);
    expect(person.className).not.toContain('pixel-worker--working');
    expect(Boolean(screen.queryByTestId('worker-bubble'))).toBe(state === 'waiting');
  });
});

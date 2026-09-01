import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Worker } from '../../shared/activity.js';
import { WorkerDrawer } from './WorkerDrawer.js';

const worker: Worker = {
  id: 'codex:lead',
  tool: 'codex',
  role: 'lead',
  state: 'working',
  project: 'agent-village',
  title: 'Build the living village',
  firstSeenAt: '2026-09-01T11:00:00.000Z',
  lastActivityAt: '2026-09-01T12:00:00.000Z',
};

function Harness() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <><button ref={trigger} onClick={() => setOpen(true)}>Open agent</button>{open && trigger.current && <WorkerDrawer worker={worker} helperCount={2} trigger={trigger.current} onClose={() => setOpen(false)} />}</>;
}

describe('WorkerDrawer', () => {
  it('shows honest agent analytics and restores focus', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open agent' });
    fireEvent.click(trigger);
    expect(screen.getByRole('heading', { name: 'Build the living village' })).toBeTruthy();
    expect(screen.getByText('Lead agent')).toBeTruthy();
    expect(screen.getByText('agent-village')).toBeTruthy();
    expect(screen.getByText('2 helpers')).toBeTruthy();
    expect(screen.getByText('2026-09-01T11:00:00.000Z')).toBeTruthy();
    expect(screen.getAllByText('Unavailable')).toHaveLength(3);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

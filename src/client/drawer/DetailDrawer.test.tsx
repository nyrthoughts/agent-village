import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';
import { DetailDrawer } from './DetailDrawer.js';

const task: DerivedTask = { id: 'bridge', title: 'Timber bridge', owner: 'Jo', effectiveStatus: 'blocked', warnings: ['invalid_evidence'], roof: false, subtasks: [], blockedReason: 'Soil decision missing', nextAction: 'Choose the footing', resumeHint: 'openclaw bridge', evidence: [{ type: 'test', verdict: 'not_checked_v1', note: 'Simulated' }] };
const project: DerivedProject = { id: 'atlas', name: 'Atlas', objective: 'Cross the river safely', effectiveStatus: 'blocked', features: [], tasks: [task] };

function Harness() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <><button ref={trigger} onClick={() => setOpen(true)}>Open bridge</button>{open && trigger.current && <DetailDrawer task={task} project={project} trigger={trigger.current} onClose={() => setOpen(false)} />}</>;
}

describe('DetailDrawer', () => {
  it('shows recovery context and restores focus after Escape', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open bridge' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Cross the river safely')).toBeTruthy();
    expect(screen.getByText('Soil decision missing')).toBeTruthy();
    expect(screen.getByText('Choose the footing')).toBeTruthy();
    expect(screen.getByText('openclaw bridge')).toBeTruthy();
    expect(screen.getByText('not checked v1')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close details' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

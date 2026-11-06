import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectPlanPanel } from './ProjectPlanPanel.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const projectId = 'project-aaaaaaaaaaaa';

it('starts with an undefined plan, shows no progress bar or percentage, and offers an explicit private plan', () => {
  const view = render(<ProjectPlanPanel projectId={projectId} language="en" editable />);
  expect(screen.getByText('Plan not defined')).toBeTruthy();
  expect(view.container.querySelector('progress')).toBeNull();
  expect(view.container.textContent).not.toMatch(/%/);
  fireEvent.click(screen.getByRole('button', { name: 'Define the goal' }));
  expect(screen.getByLabelText('Final project goal')).toHaveProperty('value', '');
});

it('is read-only when the mode cannot edit plans', () => {
  render(<ProjectPlanPanel projectId={projectId} language="en" editable={false} />);
  expect(screen.queryByRole('button', { name: 'Define the goal' })).toBeNull();
  expect(screen.getByText('Read-only in this mode.')).toBeTruthy();
});

it('opens the editor directly for “validate with a note”', () => {
  render(<ProjectPlanPanel projectId={projectId} language="en" editable startEditing />);
  expect(screen.getByLabelText('Final project goal')).toBeTruthy();
});

it('requires a validation note, saves explicit milestones and preserves a draft across updates', async () => {
  const response = vi.fn<typeof fetch>(async (_url, init) => {
    const input = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ...input.plan, revision: 1, updatedAt: new Date().toISOString(), milestones: input.plan.milestones.map((m: object) => ({ ...m, validatedAt: new Date().toISOString(), validatedBy: 'owner' })) }), { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', response);
  const view = render(<ProjectPlanPanel projectId={projectId} language="en" editable />);
  fireEvent.click(screen.getByRole('button', { name: 'Define the goal' }));
  fireEvent.change(screen.getByLabelText('Final project goal'), { target: { value: 'A stable goal' } });
  fireEvent.change(screen.getByLabelText('Milestone 1'), { target: { value: 'Test the result' } });
  fireEvent.click(screen.getByLabelText('Validate milestone 1'));
  fireEvent.click(screen.getByRole('button', { name: 'Save the plan' }));
  expect(response).not.toHaveBeenCalled();
  view.rerender(<ProjectPlanPanel projectId={projectId} language="en" editable />);
  expect(screen.getByLabelText('Final project goal')).toHaveProperty('value', 'A stable goal');
  fireEvent.change(screen.getByLabelText('Validation note 1'), { target: { value: 'Checked in browser' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save the plan' }));
  await waitFor(() => expect(screen.getByText('1/1 milestones validated')).toBeTruthy());
  expect(screen.getByText('Checked in browser')).toBeTruthy();
  expect(screen.getByText(/Validated by you/)).toBeTruthy();
  const acceptedPlan = { objective: 'A stable goal', revision: 1, updatedAt: new Date().toISOString(), milestones: [{ id: 'one', title: 'Test the result', validated: true, note: 'Checked in browser', validatedAt: new Date().toISOString(), validatedBy: 'owner' as const }] };
  view.rerender(<ProjectPlanPanel projectId={projectId} plan={acceptedPlan} language="en" editable />);
  view.rerender(<ProjectPlanPanel projectId={projectId} language="en" editable />);
  expect(screen.getByText('Plan not defined')).toBeTruthy();
});

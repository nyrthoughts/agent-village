import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectPlanPanel } from './ProjectPlanPanel.js';
import { observedVillage } from '../server/activity/projectObserver.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const project = observedVillage([{ id: 'one', tool: 'codex', state: 'idle', projectKey: 'demo', project: 'Demo', objective: 'Do not infer this as goal', history: [], lastActivityAt: new Date().toISOString() }], []).projects[0]!;
it('starts with undefined progress and offers an explicit private plan', () => {
  render(<ProjectPlanPanel project={project} language="en" />);
  expect(screen.getByText('Plan not defined')).toBeTruthy();
  expect(screen.queryByText('Do not infer this as goal')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Define the goal' }));
  expect(screen.getByLabelText('Final project goal')).toHaveProperty('value', '');
});
it('requires a validation note, saves explicit milestones and preserves a draft across polling', async () => {
  const response = vi.fn<typeof fetch>(async (_url, init) => {
    const input = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ...input.plan, revision: 1, updatedAt: new Date().toISOString(), milestones: input.plan.milestones.map((m: object) => ({ ...m, validatedAt: new Date().toISOString(), validatedBy: 'owner' })) }), { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', response);
  const view = render(<ProjectPlanPanel project={project} language="en" />);
  fireEvent.click(screen.getByRole('button', { name: 'Define the goal' }));
  fireEvent.change(screen.getByLabelText('Final project goal'), { target: { value: 'A stable goal' } });
  fireEvent.change(screen.getByLabelText('Milestone 1'), { target: { value: 'Test the result' } });
  fireEvent.click(screen.getByLabelText('Validate milestone 1'));
  fireEvent.click(screen.getByRole('button', { name: 'Save the plan' }));
  expect(response).not.toHaveBeenCalled();
  view.rerender(<ProjectPlanPanel project={{ ...project }} language="en" />);
  expect(screen.getByLabelText('Final project goal')).toHaveProperty('value', 'A stable goal');
  fireEvent.change(screen.getByLabelText('Validation note 1'), { target: { value: 'Checked in browser' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save the plan' }));
  await waitFor(() => expect(screen.getByText('1/1 milestones validated')).toBeTruthy());
  expect(screen.getByText('Checked in browser')).toBeTruthy();
  expect(screen.getByText(/Validated by you/)).toBeTruthy();
  const acceptedPlan = { objective: 'A stable goal', revision: 1, updatedAt: new Date().toISOString(), milestones: [{ id: 'one', title: 'Test the result', validated: true, note: 'Checked in browser', validatedAt: new Date().toISOString(), validatedBy: 'owner' as const }] };
  view.rerender(<ProjectPlanPanel project={{ ...project, plan: acceptedPlan }} language="en" />);
  view.rerender(<ProjectPlanPanel project={project} language="en" />);
  expect(screen.getByText('Plan not defined')).toBeTruthy();
});

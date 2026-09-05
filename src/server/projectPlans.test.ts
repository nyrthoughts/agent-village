import { mkdtempSync, chmodSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ProjectPlans } from './projectPlans.js';
import { observedVillage, projectId } from './activity/projectObserver.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const id = projectId('demo-project');
const draft = { objective: 'Ship the private village', milestones: [
  { id: 'one', title: 'Private access', validated: true, note: 'Owner tested sign-in' },
  { id: 'two', title: 'Movement', validated: false, note: '' },
] };
function setup() { const dir = mkdtempSync(join(tmpdir(), 'village-plans-test-')); dirs.push(dir); return { dir, store: new ProjectPlans(dir) }; }

it('persists explicit plans privately and rejects stale writes without losing changes', () => {
  const { dir, store } = setup();
  expect(store.read()).toEqual({});
  const saved = store.save(id, draft, 0);
  expect(saved.revision).toBe(1);
  expect(saved.milestones[0]?.validatedAt).toBeTruthy();
  expect(new ProjectPlans(dir).read()[id]).toEqual(saved);
  expect(statSync(join(dir, 'project-plans.json')).mode & 0o777).toBe(0o600);
  expect(() => store.save(id, { ...draft, objective: 'stale' }, 0)).toThrow('plan_conflict');
  expect(store.read()[id]?.objective).toBe(draft.objective);
  const reopened = store.save(id, { ...draft, milestones: draft.milestones.map((m) => ({ ...m, validated: false })) }, 1);
  expect(reopened.milestones.every((m) => !m.validatedAt)).toBe(true);
});

it('rejects missing validation notes, unknown fields, arbitrary ids and excessive plans', () => {
  const { store } = setup();
  expect(() => store.save(id, { ...draft, milestones: [{ ...draft.milestones[0], note: '' }] }, 0)).toThrow('invalid_plan');
  expect(() => store.save(id, { ...draft, token: 'should not be stored' }, 0)).toThrow('invalid_plan');
  expect(() => store.save('../../private', draft, 0)).toThrow('invalid_plan');
  expect(() => store.save(id, { ...draft, milestones: Array(13).fill(draft.milestones[0]) }, 0)).toThrow('invalid_plan');
});

it('fails closed on corrupt, broad-permission and symlinked ledgers without overwriting them', () => {
  const { dir, store } = setup(); store.save(id, draft, 0);
  const path = join(dir, 'project-plans.json');
  chmodSync(path, 0o644); expect(() => store.read()).toThrow();
  expect(() => store.save(id, draft, 1)).toThrow();
  chmodSync(path, 0o600); writeFileSync(path, 'broken');
  expect(() => store.save(id, draft, 1)).toThrow(); expect(readFileSync(path, 'utf8')).toBe('broken');
  unlinkSync(path); const target = join(dir, 'other.json'); writeFileSync(target, '{}', { mode: 0o600 }); symlinkSync(target, path);
  expect(() => store.save(id, draft, 0)).toThrow();
});

it('keeps the explicit goal stable across conversations and derives actual construction from milestones', () => {
  const { store } = setup(); const plan = store.save(id, draft, 0);
  const session = { id: 'codex:root', tool: 'codex' as const, state: 'working' as const, projectKey: 'demo-project', project: 'Demo', history: [], lastActivityAt: '2026-09-04T12:00:00Z', objective: 'A new unrelated request' };
  const village = observedVillage([session], [], [], { [id]: plan });
  expect(village.projects[0]?.objective).toBe(draft.objective);
  expect(village.projects[0]?.plan).toEqual(plan);
  expect(village.projects[0]?.progress).toEqual({ verified: 1, total: 2, remaining: 1 });
  expect(village.projects[0]?.tasks[0]?.progress.stage).toBe('walls');
  expect(village.progress.verified).toBe(1);
  const complete = store.save(id, { ...draft, milestones: draft.milestones.map((m) => ({ ...m, validated: true, note: 'Reviewed in browser' })) }, 1);
  expect(observedVillage([session], [], [], { [id]: complete }).projects[0]?.tasks[0]?.progress.stage).toBe('complete');
  expect(observedVillage([session], []).projects[0]?.objective).not.toBe(session.objective);
  expect(observedVillage([session], []).projects[0]?.tasks[0]?.progress.stage).toBe('lot');
});

it('retains planned projects when no recent conversation is available', () => {
  const { store } = setup(); const plan = store.save(id, draft, 0, 'owner', 'Quiet Orchard');
  const village = observedVillage([], [], ['Quiet Orchard'], { [id]: plan });
  expect(village.projects).toHaveLength(1);
  expect(village.projects[0]?.name).toBe('Quiet Orchard');
  expect(village.projects[0]?.observation?.sessions).toEqual([]);
  expect(village.projects[0]?.progress).toEqual({ verified: 1, total: 2, remaining: 1 });
});

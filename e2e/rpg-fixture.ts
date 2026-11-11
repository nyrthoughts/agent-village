import { expect, type Page } from '@playwright/test';
import { observedVillage } from '../src/server/activity/projectObserver.js';
import type { ObservedSession } from '../src/shared/observation.js';
import type { WorkerAttention } from '../src/shared/activity.js';

export async function openRpg(page: Page, count = 5) {
  const projects = ['Atlas Library', 'Privacy Desk', 'Connector Lab', 'Warehouse', 'Launch Studio',
    'Map Room', 'Pottery Yard', 'North Orchard', 'South Orchard'].slice(0, count);
  const now = Date.parse('2026-09-04T12:00:00Z');
  const at = (seconds: number) => new Date(now - seconds * 1000).toISOString();
  await page.clock.setFixedTime(now);
  await page.addInitScript(() => { localStorage.setItem('agent-village:language', 'en'); });
  const create = (index: number, title: string, tool: 'claude' | 'codex', seconds: number, state: ObservedSession['state'], extra?: Partial<ObservedSession>): ObservedSession => ({
    id: `${tool}:fixture-${title.toLowerCase().replace(/ /g, '-')}`,
    project: projects[index]!, projectKey: projects[index]!, title, tool, state, lastActivityAt: at(seconds),
    activityEvidence: { level: seconds < 120 ? 'recent' : 'detected', source: tool === 'claude' ? 'claude-hook' : 'codex-journal', observedAt: at(seconds) },
    history: [], ...extra,
  });
  const attention = (kind: WorkerAttention['kind'], seconds: number) => ({ kind, at: at(seconds), source: 'claude-hook' as const });
  const entries = [
    create(0, 'Map the stacks', 'codex', 3, 'working'),
    create(0, 'Index the archive', 'codex', 15, 'idle'),
    create(1, 'Check retention', 'claude', 20, 'waiting', { attention: attention('input', 20) }),
    create(1, 'Review the log', 'codex', 180, 'idle'),
    create(2, 'Validate the connector', 'claude', 28, 'waiting', { failure: { at: at(28), source: 'claude-hook' } }),
    create(2, 'Update the schema', 'claude', 36, 'working'),
    create(3, 'Refresh the models', 'claude', 41, 'waiting', { attention: attention('approval', 41),
      history: [{ at: at(41), kind: 'report', text: 'The staging model compiled. The sandbox build is awaiting approval.' }] }),
    create(3, 'Build the segments', 'codex', 44, 'working'),
    create(3, 'Select a date range', 'claude', 53, 'waiting', { attention: attention('input', 53) }),
    create(4, 'Review the landing page', 'claude', 68, 'working'),
  ];
  const snapshot = observedVillage(entries, [], [], {}, projects.map((name, i) => ({ name, key: name, links: i < 5 ? [] : [{ title: 'Owner notes', url: 'https://example.test/notes', source: 'other' }] })));
  snapshot.observation!.fixture = true;
  snapshot.observation!.sources = [
    { id: 'claude', label: 'Claude Code', status: 'supported', experimental: false, rootsFound: 1, rootsChecked: 1, sessions: 6 },
    { id: 'codex', label: 'Codex', status: 'supported', experimental: false, rootsFound: 1, rootsChecked: 1, sessions: 4 },
  ];
  await page.route('**/api/village', (route) => route.fulfill({ json: snapshot }));
  await page.route('**/api/activity', (route) => route.fulfill({ json: { status: 'live', fetchedAt: at(0), workers: [] } }));
  await page.goto('/');
  await expect(page.locator('.rpg-base')).toBeVisible();
}

export async function captureRpg(page: Page, name: string) {
  const directory = process.env.VILLAGE_CAPTURE_DIR;
  if (!directory) return;
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
    const spriteUrls = [...document.querySelectorAll('.rpg-sprite')].map((sprite) => getComputedStyle(sprite).backgroundImage.slice(5, -2));
    await Promise.all(spriteUrls.map((url) => { const image = new Image(); image.src = url; return image.decode(); }));
  });
  await page.screenshot({ path: `${directory}/${name}.png`, animations: 'allow' });
}

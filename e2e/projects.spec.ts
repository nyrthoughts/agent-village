import { expect, test } from '@playwright/test';
import { observedVillage } from '../src/server/activity/projectObserver.js';
import type { ObservedSession } from '../src/shared/observation.js';

// Fictional sessions: one repository seen through two tools, an owner rule, and the Unassigned inbox.
const at = '2026-09-04T12:00:00Z';
const sessions: ObservedSession[] = [
  { id: 'codex:w1', tool: 'codex', state: 'idle', title: 'Recount stock', projectKey: 'remote:github.com/demo-org/warehouse', project: 'warehouse', matchedBy: 'remote', matchDetail: 'github.com/demo-org/warehouse', history: [], lastActivityAt: at },
  { id: 'claude:w2', tool: 'claude', state: 'idle', title: 'Shelf labels', projectKey: 'remote:github.com/demo-org/warehouse', project: 'warehouse', matchedBy: 'remote', matchDetail: 'github.com/demo-org/warehouse', history: [], lastActivityAt: at },
  { id: 'claude:b1', tool: 'claude', state: 'idle', title: 'Invoice draft', projectKey: 'alias:Billing', project: 'Billing', matchedBy: 'rule', matchVia: 'title', matchDetail: '^billing:', history: [], lastActivityAt: at },
  { id: 'claude:home', tool: 'claude', state: 'idle', title: 'Groceries', projectKey: 'unassigned', project: 'Sessions non classées', matchedBy: 'unassigned', matchVia: 'catch-all', matchDetail: '~', history: [], lastActivityAt: at },
];

test('groups sessions by project, explains each match and keeps unassigned sessions in an inbox', async ({ page }) => {
  const snapshot = observedVillage(sessions, [], [], {}, [
    { key: 'alias:Billing', name: 'Billing', links: [{ title: 'Pricing brainstorm', url: 'https://claude.ai/chat/demo', source: 'claude-app' }] },
  ]);
  await page.route('**/api/village', (route) => route.fulfill({ json: snapshot }));
  await page.route('**/api/activity', (route) => route.fulfill({ json: { status: 'live', fetchedAt: at, workers: [] } }));
  await page.goto('/');
  await expect(page.locator('[data-task-id]')).toHaveCount(2);
  const inbox = page.getByRole('region', { name: 'Sessions non classées · 1' });
  await expect(inbox).toContainText('sessions: [claude:home]');
  await page.getByRole('button', { name: 'Ouvrir warehouse', exact: true }).click();
  await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Codex · 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Claude Code · 1' })).toBeVisible();
  await expect(page.getByText('Rattachement : Même dépôt distant · github.com/demo-org/warehouse').first()).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le projet' }).click();
  await page.getByRole('button', { name: 'Ouvrir Billing', exact: true }).click();
  await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Pricing brainstorm' })).toHaveAttribute('href', 'https://claude.ai/chat/demo');
  await page.getByRole('button', { name: 'Fermer le projet' }).click();
  await inbox.getByRole('button', { name: 'Trier ces sessions' }).click();
  await expect(page.getByRole('heading', { name: 'Ranger ces sessions' })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le projet' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

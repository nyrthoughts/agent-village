import { expect, test, type Page } from '@playwright/test';
import { observedVillage } from '../src/server/activity/projectObserver.js';
import { CONSTRUCTION_STAGES } from '../src/shared/statuses.js';
import type { ProjectPlan } from '../src/shared/projectPlan.js';

const names = ['Kumo workshop', 'Saffron courtyard', 'Canal house', 'Maré atelier', 'Aegean steps', 'Pine storehouse', 'New plot'];
const timestamp = '2026-09-04T12:00:00Z';

async function openBuildingVillage(page: Page, construction = false) {
  const selected = names.slice(0, construction ? 7 : 6);
  const sessions = selected.map((name, index) => ({ id: `codex:fictional-${index}`, tool: 'codex' as const, state: 'idle' as const, projectKey: name, project: name, title: `${name} work`, history: [], lastActivityAt: timestamp }));
  const base = observedVillage(sessions, [], selected);
  const plans = Object.fromEntries(base.projects.flatMap((project) => {
    const index = selected.indexOf(project.name);
    if (index === 6) return [];
    const verified = construction ? index : 5;
    const plan: ProjectPlan = {
      objective: `Make ${project.name} ready for visitors.`, revision: 1, updatedAt: timestamp,
      milestones: Array.from({ length: 5 }, (_, milestone) => ({ id: `step-${milestone}`, title: `Milestone ${milestone + 1}`, validated: milestone < verified, note: milestone < verified ? 'Fictional fixture verified locally.' : '', ...(milestone < verified ? { validatedAt: timestamp, validatedBy: 'owner' as const } : {}) })),
    };
    return [[project.id, plan]];
  }));
  const village = observedVillage(sessions, [], selected, plans);
  // Exercise every server stage explicitly: real milestone totals vary by project.
  if (construction) for (const project of village.projects) {
    const index = selected.indexOf(project.name);
    if (index < 6) project.tasks[0]!.progress = { stage: CONSTRUCTION_STAGES[index]!, stageIndex: index, total: 5, verified: index, remaining: 5 - index };
  }
  await page.route('**/api/village', (route) => route.fulfill({ json: village }));
  await page.route('**/api/activity', (route) => route.fulfill({ json: { status: 'live', fetchedAt: timestamp, workers: [] } }));
  await page.goto('/');
  await expect(page.getByTestId('village-map-2d')).toHaveAttribute('data-building-count', String(selected.length));
}

test('six finished original architectures remain visible and open directly', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openBuildingVillage(page);
  await expect(page.locator('[data-building-layer="finish"]')).toHaveCount(6);
  expect(await page.locator('[data-architecture-outline]').evaluateAll((paths) => new Set(paths.map((path) => path.getAttribute('d'))).size)).toBe(6);
  await page.screenshot({ path: 'output/playwright/buildings-six-desktop.png', fullPage: true });
  await page.locator('.pixel-world').screenshot({ path: 'output/playwright/buildings-six-village.png' });
  await page.locator('.pixel-building').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('all six physical stages and the undefined survey are distinct', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1150 });
  await openBuildingVillage(page, true);
  for (const stage of [...CONSTRUCTION_STAGES, 'survey']) await expect(page.locator(`.pixel-building[data-stage="${stage}"]`)).toHaveCount(1);
  await expect(page.locator('[data-building-layer="finish"]')).toHaveCount(1);
  await expect(page.locator('[data-building-layer="roof"]')).toHaveCount(2);
  await page.screenshot({ path: 'output/playwright/buildings-stages-desktop.png', fullPage: true });
});

test('the six-family village fits mobile and remains keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBuildingVillage(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/buildings-six-mobile.png', fullPage: true });
  const building = page.locator('.pixel-building').first();
  await building.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('the visible upper roof opens the house even above its collision footprint', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openBuildingVillage(page);
  const art = await page.locator('[data-family="dutch_gable"] .traveler-building__art').boundingBox();
  if (!art) throw new Error('Dutch roof is not visible');
  await page.mouse.click(art.x + art.width / 2, art.y + art.height * 13 / 128);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 });
});

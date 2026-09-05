import { expect, test, type Page } from '@playwright/test';
import { observedVillage } from '../src/server/activity/projectObserver.js';
import type { Worker } from '../src/shared/activity.js';

test.use({ hasTouch: true });

async function openFictionalVillage(page: Page, additionalProjects = 0, withWorkers = false) {
  const followed = ['Product', 'Data', 'Delivery', 'CLI', 'Research', 'Village'];
  const names = [...followed, ...Array.from({ length: additionalProjects }, (_, index) => `Archive ${index}`)];
  const village = observedVillage(names.map((name, index) => ({ id: `codex:${index}`, tool: 'codex' as const, state: 'idle' as const, projectKey: name, project: name, title: `${name} work`, history: [], lastActivityAt: '2026-09-04T12:00:00Z' })), [], followed);
  let reads = 0;
  const workers: Worker[] = withWorkers ? [
    { id: 'waiting-helper', tool: 'claude', role: 'helper', state: 'waiting', activityEvidence: { level: 'confirmed', source: 'claude-process', observedAt: '2026-09-04T12:00:00Z' }, lastActivityAt: '2026-09-04T12:00:00Z', attachedTaskId: village.projects[0]!.id },
    { id: 'idle-helper', tool: 'claude', role: 'helper', state: 'idle', activityEvidence: { level: 'confirmed', source: 'claude-process', observedAt: '2026-09-04T12:00:00Z' }, lastActivityAt: '2026-09-04T12:00:00Z', attachedTaskId: village.projects[0]!.id },
    { id: 'unknown-helper', tool: 'codex', role: 'helper', state: 'unknown', lastActivityAt: '2026-09-04T12:00:00Z', attachedTaskId: village.projects[0]!.id },
  ] : [];
  await page.route('**/api/village', (route) => { reads++; return route.fulfill({ json: village }); });
  await page.route('**/api/activity', (route) => route.fulfill({ json: { status: 'live', fetchedAt: '2026-09-04T12:00:00Z', workers } }));
  await page.goto('/');
  await expect(page.getByTestId('village-map-2d')).toHaveAttribute('data-building-count', '6');
  return () => reads;
}

async function groundTile(page: Page, x: number, y: number, touch = false) {
  const world = await page.locator('.pixel-world').boundingBox();
  if (!world) throw new Error('Village world is not visible');
  const map = page.getByTestId('village-map-2d');
  const width = Number(await map.getAttribute('data-world-width'));
  const height = Number(await map.getAttribute('data-world-height'));
  const target = { x: world.x + (x + 0.5) / width * world.width, y: world.y + (y + 0.5) / height * world.height };
  if (touch) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
}

test('first ground click walks through polling with 23 projects; houses, keyboard and English remain immediate', async ({ page }) => {
  const reads = await openFictionalVillage(page, 17);
  const map = page.getByTestId('village-map-2d');
  await expect(page.getByRole('button', { name: 'Visiter le village' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Apparence de votre avatar' }).selectOption('iris');
  await expect(page.getByTestId('village-avatar')).toHaveClass(/pixel-avatar--iris/);
  await page.screenshot({ path: 'output/playwright/visit-desktop.png', fullPage: true });
  await groundTile(page, 19, 7);
  await expect(map).toHaveAttribute('data-player-walking', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(map).toHaveAttribute('data-player-y', '7', { timeout: 12_000 });
  await expect(map).toHaveAttribute('data-player-x', '19');
  expect(reads()).toBeGreaterThanOrEqual(2);
  await page.locator('.pixel-building').first().click();
  await expect(map).toHaveAttribute('data-player-walking', 'false');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le projet' }).click();
  await page.locator('.pixel-building').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(map).toHaveAttribute('data-player-walking', 'false');
  await page.getByRole('button', { name: 'Fermer le projet' }).click();
  await page.getByRole('combobox', { name: 'Langue / Language' }).selectOption('en');
  await expect(page.getByRole('status')).toHaveText('Click the ground to walk, or a house to open its brief.');
  await expect(page.getByRole('combobox', { name: 'Your avatar appearance' })).toHaveValue('iris');
  await expect(page.getByTestId('village-avatar')).toHaveAttribute('aria-label', 'You');
  await expect(page.getByTestId('animal-moss-capybara')).toHaveAttribute('aria-label', 'Moss capybara — decorative');
  await expect(page.getByTestId('animal-copper-otter')).toHaveAttribute('data-motion', 'running');
});

test('real mobile taps move the avatar, refuse water and leave direct access available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFictionalVillage(page);
  const map = page.getByTestId('village-map-2d');
  await page.getByRole('combobox', { name: 'Apparence de votre avatar' }).selectOption('sun');
  await groundTile(page, 31, 40, true);
  await expect(map).toHaveAttribute('data-player-y', '40');
  await groundTile(page, 48, 41, true);
  await expect(map).toHaveAttribute('data-player-walking', 'false');
  await expect(page.getByRole('status')).toHaveText('Destination inaccessible.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/visit-mobile.png', fullPage: true });
  await page.locator('.pixel-building').first().tap();
  await expect(map).toHaveAttribute('data-player-walking', 'false');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le projet' }).tap();
  await page.getByRole('button', { name: 'Ouvrir Product', exact: true }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('reduced motion moves directly, keeps animals still and leaves houses immediately accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFictionalVillage(page);
  await groundTile(page, 31, 40);
  await expect(page.getByTestId('village-map-2d')).toHaveAttribute('data-player-y', '40');
  for (const animal of ['animal-moss-capybara', 'animal-copper-otter']) {
    await expect(page.getByTestId(animal)).toHaveAttribute('data-motion', 'paused');
    expect(await page.getByTestId(animal).locator('.village-animal__stroll').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  }
  await page.locator('.pixel-building').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('village-map-2d')).toHaveAttribute('data-player-walking', 'false');
  expect(await page.locator('.pixel-avatar__body').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});

test('waiting, idle and unknown helpers do not animate as working people', async ({ page }) => {
  await openFictionalVillage(page, 0, true);
  for (const id of ['waiting-helper', 'idle-helper', 'unknown-helper']) {
    const worker = page.locator(`[data-worker-id="${id}"]`);
    await expect(worker).toBeVisible();
    expect(await worker.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  }
});

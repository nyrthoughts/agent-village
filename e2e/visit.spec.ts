import { expect, test, type Page } from '@playwright/test';
import { observedVillage } from '../src/server/activity/projectObserver.js';

test.use({ hasTouch: true });

async function openFictionalVillage(page: Page) {
  const names = ['Product', 'Data', 'Delivery', 'CLI', 'Research', 'Village'];
  const village = observedVillage(names.map((name, index) => ({ id: `codex:${index}`, tool: 'codex' as const, state: 'idle' as const, projectKey: name, project: name, title: `${name} work`, history: [], lastActivityAt: '2026-09-04T12:00:00Z' })), [], names);
  await page.route('**/api/village', (route) => route.fulfill({ json: village }));
  await page.route('**/api/activity', (route) => route.fulfill({ json: { status: 'live', fetchedAt: '2026-09-04T12:00:00Z', workers: [] } }));
  await page.goto('/');
  await expect(page.getByTestId('village-map-2d')).toHaveAttribute('data-building-count', '6');
}

async function tapTile(page: Page, x: number, y: number) {
  const world = await page.locator('.pixel-world').boundingBox();
  if (!world) throw new Error('Village world is not visible');
  const map = page.getByTestId('village-map-2d');
  const width = Number(await map.getAttribute('data-world-width'));
  const height = Number(await map.getAttribute('data-world-height'));
  await page.touchscreen.tap(world.x + (x + 0.5) / width * world.width, world.y + (y + 0.5) / height * world.height);
}

test('mouse visit reaches a house, survives refresh and retains immediate keyboard and English access', async ({ page }) => {
  await openFictionalVillage(page);
  const map = page.getByTestId('village-map-2d');
  await page.getByRole('button', { name: 'Visiter le village' }).click();
  await page.getByRole('combobox', { name: 'Apparence de votre avatar' }).selectOption('iris');
  await expect(page.getByTestId('village-avatar')).toHaveClass(/pixel-avatar--iris/);
  await page.screenshot({ path: 'output/playwright/visit-desktop.png', fullPage: true });
  await page.locator('.pixel-building').first().click();
  await expect(map).toHaveAttribute('data-player-walking', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 12_000 });
  await expect(map).toHaveAttribute('data-player-walking', 'false');
  await page.getByRole('button', { name: 'Fermer le projet' }).click();
  await page.locator('.pixel-building').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(map).toHaveAttribute('data-player-walking', 'false');
  await page.getByRole('button', { name: 'Fermer le projet' }).click();
  await page.getByRole('combobox', { name: 'Langue / Language' }).selectOption('en');
  await expect(page.getByRole('button', { name: 'Leave visit mode' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Your avatar appearance' })).toHaveValue('iris');
  await expect(page.getByTestId('village-avatar')).toHaveAttribute('aria-label', 'You');
});

test('real mobile taps move the avatar, refuse water and leave direct access available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFictionalVillage(page);
  const map = page.getByTestId('village-map-2d');
  await page.getByRole('button', { name: 'Visiter le village' }).tap();
  await page.getByRole('combobox', { name: 'Apparence de votre avatar' }).selectOption('sun');
  await tapTile(page, 31, 40);
  await expect(map).toHaveAttribute('data-player-y', '40');
  await page.locator('.pixel-building').first().tap();
  await expect(map).toHaveAttribute('data-player-walking', 'true');
  await tapTile(page, 48, 41);
  await expect(map).toHaveAttribute('data-player-walking', 'false');
  await expect(page.getByRole('status')).toHaveText('Destination inaccessible.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/visit-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Ouvrir Product', exact: true }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('reduced motion reaches a selected house without walking animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFictionalVillage(page);
  await page.getByRole('button', { name: 'Visiter le village' }).click();
  await page.locator('.pixel-building').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('village-map-2d')).toHaveAttribute('data-player-walking', 'false');
  expect(await page.locator('.pixel-avatar__body').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});

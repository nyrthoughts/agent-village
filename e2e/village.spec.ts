import { expect, test } from '@playwright/test';

test('village fits all six projects on the first screen with separate controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const buildings = page.locator('.pixel-building');
  await expect(buildings).toHaveCount(6);
  await expect(page.locator('.pixel-building__name')).toHaveCount(6);
  expect(await page.locator('.pixel-building__name').evaluateAll((nodes) => nodes.every((node) => node.getBoundingClientRect().height >= 14))).toBe(true);
  await expect.poll(() => buildings.evaluateAll((nodes) => nodes.every((node) => {
    const r = node.getBoundingClientRect();
    return r.top >= 60 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight - 45;
  }))).toBe(true);
  const reset = await page.getByRole('button', { name: 'Recentrer', exact: true }).boundingBox();
  const toggle = await page.getByRole('button', { name: 'Switch to board view' }).boundingBox();
  expect(reset!.x).toBeGreaterThan(toggle!.x + toggle!.width);
  await page.getByRole('button', { name: /Beacon Relay\. Calme/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Beacon Relay' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary')).toHaveCount(0);
});

test('unmatched sessions open a source conversation instead of a dead click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /scratch-notes/ }).click();
  await expect(page.getByRole('heading', { name: /Conversation d’origine/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to board view' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Copier la reprise' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary')).toHaveCount(0);
});

test('seen attention can be restored from the village with a zero counter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^À toi \(/ }).click();
  const seen = page.getByRole('button', { name: 'Marquer vu', exact: true });
  while (await seen.count()) await seen.first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'À toi (0)', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Depuis ta dernière visite/ })).toBeVisible();
  await page.getByRole('button', { name: /réafficher/i }).click();
  await expect(page.locator('[data-attention-type]')).not.toHaveCount(0);
});

test('mobile village keeps navigation and the source conversation usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Langue / Language' })).toBeInViewport();
  await expect(page.locator('.pixel-building__name')).toHaveCount(6);
  expect(await page.locator('.pixel-building__name').evaluateAll((nodes) => nodes.every((node) => node.getBoundingClientRect().height >= 14))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /scratch-notes/ }).click();
  await expect(page.getByRole('heading', { name: /Conversation d’origine/ })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le détail' }).click();
  await page.getByRole('button', { name: /^À toi \(/ }).click();
  await expect(page.getByRole('heading', { name: /^À toi$/ })).toBeVisible();
});

test('arriving changes do not move the source detail being read', async ({ page }) => {
  let arriving = 0;
  await page.route('**/api/board', async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.seq += arriving;
    await route.fulfill({ response, json: snapshot });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Beacon Relay\. Calme/ }).click();
  const heading = page.getByRole('heading', { level: 2, name: 'Beacon Relay' });
  const before = await heading.boundingBox();
  arriving = 3;
  await expect(page.getByRole('button', { name: '3 changements — appliquer' })).toBeVisible();
  expect((await heading.boundingBox())!.y).toBe(before!.y);
  await page.getByRole('button', { name: '3 changements — appliquer' }).click();
  await expect(page.getByRole('button', { name: '3 changements — appliquer' })).toHaveCount(0);
});

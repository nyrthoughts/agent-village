import { expect, test } from '@playwright/test';
import { captureRpg, openRpg } from './rpg-fixture.js';

test('desktop pixel village exposes construction, navigation and one-click context', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const scene = page.getByTestId('village-map-2d');
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute('data-building-count', '8');
  await expect(scene).toHaveAttribute('data-worker-count', '3');
  await expect(scene).toHaveAttribute('data-lead-count', '1');
  await expect(scene).toHaveAttribute('data-helper-count', '1');
  await expect(scene).toHaveAttribute('data-world-width', '64');
  await expect(scene.getByTestId('forest-frame')).toBeVisible();
  await expect(scene.getByTestId('pixel-cliff')).toBeVisible();
  await expect(scene.getByTestId('pixel-pond')).toBeVisible();
  await expect(scene.locator('[data-path-kind="square"]')).toHaveCount(1);
  await expect(scene.locator('[data-building-variant]').first()).toHaveAttribute('data-sprite-scale', 'compact');
  const stages = await scene.locator('[data-stage]').evaluateAll((elements) => [...new Set(elements.map((element) => element.getAttribute('data-stage')))]);
  expect(new Set(stages)).toEqual(new Set(['lot', 'foundation', 'frame', 'walls', 'roof', 'complete']));
  const families = await scene.locator('[data-family]').evaluateAll((elements) => [...new Set(elements.map((element) => element.getAttribute('data-family')))]);
  expect(families).toHaveLength(6);
  await expect(scene.locator('.pixel-zone-sign', { hasText: 'Atlas' })).toBeVisible();
  await expect(scene.locator('.pixel-zone-sign', { hasText: 'Beacon' })).toBeVisible();
  await expect(page.locator('[data-layout="location-plaque"]')).toBeVisible();
  await expect(page.locator('[data-layout="sprite-strip"]')).toBeVisible();

  await scene.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(scene).toHaveAttribute('data-camera-x', '3');
  await scene.getByRole('button', { name: 'Reset village view' }).click();
  await expect(scene).toHaveAttribute('data-camera-x', '0');

  await scene.getByRole('button', { name: /Timber bridge/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('The western footing still needs a soil decision')).toBeVisible();
  await expect(page.getByText('Choose the footing after the soil note arrives')).toBeVisible();
  await expect(page.getByText('openclaw atlas bridge')).toBeVisible();
  await expect(page.getByText('frame')).toBeVisible();
  await expect(page.getByText('1 / 3 verified')).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();

  await scene.getByRole('button', { name: /Codex lead agent/i }).click();
  await expect(page.getByRole('heading', { name: 'Codex on atlas contours' })).toBeVisible();
  await expect(page.getByText('Token usage')).toBeVisible();
  await expect(page.getByText(/Agent Village never estimates it/)).toBeVisible();
  await page.getByRole('button', { name: 'Close agent details' }).click();
  await expect(scene.locator('.pixel-worker__count', { hasText: '1' })).toBeVisible();
  const personTargets = await scene.locator('.pixel-worker').evaluateAll((elements) => elements.map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  expect(personTargets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
});

test('native village opens a project and its source, then switches to List', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRpg(page);
  await expect(page.locator('.rpg-house')).toHaveCount(5);
  await expect(page.locator('.rpg-empty')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Needs you 4' })).toBeVisible();
  await captureRpg(page, '01-village-desktop');
  await page.getByRole('button', { name: 'Open Warehouse', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Warehouse' })).toBeVisible();
  await expect(page.locator('.rpg-house[data-dim=true]')).toHaveCount(4);
  await captureRpg(page, '02-village-projet');
  await page.getByRole('button', { name: 'Close project' }).click();
  await page.locator('.rpg-request', { hasText: 'Refresh the models' }).click();
  await expect(page.getByRole('heading', { name: 'Refresh the models', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Village journal' })).toBeVisible();
});

test('a ninth project uses the next map', async ({ page }) => {
  await openRpg(page, 9);
  await expect(page.locator('.rpg-house')).toHaveCount(8);
  await page.getByRole('button', { name: 'Next map' }).click();
  await expect(page.locator('.rpg-house')).toHaveCount(1);
  await page.getByRole('button', { name: 'Previous map' }).click();
  await expect(page.locator('.rpg-house')).toHaveCount(8);
});

import { expect, test } from '@playwright/test';

test('desktop 3D village exposes construction, navigation and one-click context', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const scene = page.getByTestId('village-scene-3d');
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute('data-scene-ready', 'true');
  await expect(scene).toHaveAttribute('data-building-count', '8');
  await expect(scene).toHaveAttribute('data-worker-count', '3');
  await expect(scene).toHaveAttribute('data-camera-azimuth', '45');
  await expect(scene.locator('.scene-district-label', { hasText: 'Atlas' })).toBeVisible();
  await expect(scene.locator('.scene-district-label', { hasText: 'Beacon' })).toBeVisible();

  const initialZoom = Number(await scene.getAttribute('data-camera-zoom'));
  const canvas = scene.locator('canvas');
  await canvas.hover();
  await page.mouse.wheel(0, -180);
  await expect.poll(async () => Number(await scene.getAttribute('data-camera-zoom'))).toBeGreaterThan(initialZoom);
  const initialTarget = await scene.getAttribute('data-camera-target');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 80, bounds!.y + bounds!.height / 2 + 25);
  await page.mouse.up();
  await expect.poll(() => scene.getAttribute('data-camera-target')).not.toBe(initialTarget);
  await expect(scene).toHaveAttribute('data-camera-azimuth', '45');
  await scene.getByRole('button', { name: 'Reset 3D view' }).click();
  await expect(scene).toHaveAttribute('data-camera-target', '0.000:0.000');

  await scene.getByRole('button', { name: /Timber bridge/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('The western footing still needs a soil decision')).toBeVisible();
  await expect(page.getByText('Choose the footing after the soil note arrives')).toBeVisible();
  await expect(page.getByText('openclaw atlas bridge')).toBeVisible();
});

import { expect, test } from '@playwright/test';

test('desktop pixel village exposes construction, navigation and one-click context', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const scene = page.getByTestId('village-map-2d');
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute('data-building-count', '8');
  await expect(scene).toHaveAttribute('data-worker-count', '3');
  await expect(scene).toHaveAttribute('data-world-width', '64');
  await expect(scene.locator('.pixel-zone-sign', { hasText: 'Atlas' })).toBeVisible();
  await expect(scene.locator('.pixel-zone-sign', { hasText: 'Beacon' })).toBeVisible();

  await scene.focus();
  await page.keyboard.press('ArrowRight');
  await expect(scene).toHaveAttribute('data-camera-x', '3');
  await scene.getByRole('button', { name: 'Reset village view' }).click();
  await expect(scene).toHaveAttribute('data-camera-x', '0');

  await scene.getByRole('button', { name: /Timber bridge/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('The western footing still needs a soil decision')).toBeVisible();
  await expect(page.getByText('Choose the footing after the soil note arrives')).toBeVisible();
  await expect(page.getByText('openclaw atlas bridge')).toBeVisible();
});

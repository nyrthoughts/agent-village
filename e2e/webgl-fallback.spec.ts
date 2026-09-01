import { expect, test } from '@playwright/test';

test('falls back to the accessible table when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('webgl-fallback')).toBeVisible();
  await expect(page.getByText('3D unavailable; showing accessible table.')).toBeVisible();
  await expect(page.locator('[data-task-id="atlas-bridge"]')).toBeVisible();
});

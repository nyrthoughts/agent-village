import { expect, test } from '@playwright/test';

test('390 px field view is ordered, reachable and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const village = page.getByTestId('village-map-2d');
  await expect(village).toBeVisible();
  await expect(village).toHaveAttribute('data-building-count', '8');
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasOverflow).toBe(false);
  await page.locator('.attention-list').getByRole('button', { name: /Timber bridge/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close details' })).toBeFocused();
});

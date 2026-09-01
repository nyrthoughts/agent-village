import { expect, test } from '@playwright/test';

test('truth-only activity removes workers without changing buildings', async ({ page }) => {
  await page.route('**/api/activity', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ status: 'absent', fetchedAt: '2026-08-31T16:00:00.000Z', workers: [] }),
  }));
  await page.goto('/');
  await expect(page.getByText('Truth only')).toBeVisible();
  const scene = page.getByTestId('village-scene-3d');
  await expect(scene).toHaveAttribute('data-building-count', '8');
  await expect(scene).toHaveAttribute('data-worker-count', '0');
  await expect(scene.getByRole('button', { name: /Contour studio/i })).toBeVisible();
});

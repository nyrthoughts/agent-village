import { expect, test } from '@playwright/test';

test('reduced motion disables looping construction animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const animationName = await page.getByTestId('village-scene-3d').evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe('none');
});

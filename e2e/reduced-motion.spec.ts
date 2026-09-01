import { expect, test } from '@playwright/test';

test('reduced motion disables looping village animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const animationName = await page.locator('.pixel-worker').first().evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe('none');
});

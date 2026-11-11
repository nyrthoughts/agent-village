import { expect, test } from '@playwright/test';
import { captureRpg, openRpg } from './rpg-fixture.js';

test('reduced motion disables looping village animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const animationName = await page.locator('.pixel-worker').first().evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe('none');
});

test('native village parks sprites under the system motion setting', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRpg(page);
  await expect(page.locator('.rpg-layout')).toHaveAttribute('data-reduced', 'true');
  await expect(page.locator('.rpg-villager[data-state=working] .rpg-sprite').first()).toHaveCSS('animation-name', 'none');
  await captureRpg(page, '04-village-mouvement-reduit');
});

test('native Motion control stops and restores sprite loops', async ({ page }) => {
  await openRpg(page);
  const control = page.getByRole('button', { name: 'Reduced motion' });
  const sprite = page.locator('.rpg-villager[data-state=working] .rpg-sprite').first();
  await expect(sprite).toHaveCSS('animation-name', 'rpg-frames');
  await control.click();
  await expect(sprite).toHaveCSS('animation-name', 'none');
  await control.click();
  await expect(sprite).toHaveCSS('animation-name', 'rpg-frames');
});

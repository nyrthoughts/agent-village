import { expect, test } from '@playwright/test';
import { openRpg } from './rpg-fixture.js';

test('native village loads a real sprite sheet for each observed state', async ({ page }) => {
  await openRpg(page);
  for (const state of ['working', 'idle', 'approval', 'input', 'error', 'offline']) {
    const sprite = page.locator(`.rpg-villager[data-state=${state}] .rpg-sprite`).first();
    await expect(sprite).toBeVisible();
    const [url, width, height] = await sprite.evaluate(async (element) => {
      const url = getComputedStyle(element).backgroundImage.slice(5, -2);
      const image = new Image();
      image.src = url;
      await image.decode();
      return [url, image.naturalWidth, image.naturalHeight];
    });
    expect(url).toContain(`-${state}.webp`);
    expect([width, height]).toEqual([1200, 300]);
  }
});

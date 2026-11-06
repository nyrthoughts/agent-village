import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4180';
const OUT = '/opt/cursor/artifacts';

async function main() {
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop village view (1440x900)
  console.log('1/4 Desktop village view...');
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/village-desktop.png`, fullPage: false });
  console.log('  -> village-desktop.png');

  // 2. Click an agent bot to open the session drawer
  console.log('2/4 Session drawer...');
  const bot = page.locator('.raster-bot').first();
  if (await bot.count() > 0) {
    await bot.click();
    await page.waitForTimeout(600);
  } else {
    const notif = page.locator('.notif-item').first();
    if (await notif.count() > 0) {
      await notif.click();
      await page.waitForTimeout(600);
    }
  }
  await page.screenshot({ path: `${OUT}/village-drawer.png`, fullPage: false });
  console.log('  -> village-drawer.png');

  // Close drawer
  const closeBtn = page.locator('.session-drawer__close');
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }

  // 3. Board view
  console.log('3/4 Board view...');
  const boardBtn = page.locator('.village-toggle__btn', { hasText: 'Board' });
  if (await boardBtn.count() > 0) {
    await boardBtn.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${OUT}/board-desktop.png`, fullPage: false });
  console.log('  -> board-desktop.png');
  await ctx.close();

  // 4. Mobile village (390x844)
  console.log('4/4 Mobile village...');
  const mCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    colorScheme: 'dark',
    isMobile: true,
  });
  const mPage = await mCtx.newPage();
  await mPage.goto(BASE, { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(2000);
  const vBtn = mPage.locator('.village-toggle__btn', { hasText: 'Village' });
  if (await vBtn.count() > 0) {
    const pressed = await vBtn.getAttribute('aria-pressed');
    if (pressed !== 'true') { await vBtn.click(); await mPage.waitForTimeout(500); }
  }
  await mPage.screenshot({ path: `${OUT}/village-mobile.png`, fullPage: false });
  console.log('  -> village-mobile.png');
  await mCtx.close();

  await browser.close();
  console.log('All screenshots saved to', OUT);
}

main().catch((err) => { console.error(err); process.exit(1); });

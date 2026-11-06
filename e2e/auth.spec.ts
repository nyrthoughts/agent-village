import { expect, test } from '@playwright/test';
import { startNative } from './nativeHarness.js';

test('real passkey verifier protects the board and stream, rejects replay and clears the board on lock and expiry', async ({ browser }) => {
  test.setTimeout(90_000);
  const native = await startNative(browser);
  const { page, origin } = native;
  try {
    const outbound: string[] = [];
    page.on('request', (request) => { if (!request.url().startsWith(origin)) outbound.push(new URL(request.url()).origin); });
    for (const path of ['/api/board', '/api/stream']) {
      expect((await fetch(`${origin}${path}`)).status).toBe(401);
      expect((await fetch(`${origin}${path}`, { headers: { authorization: native.ingestion } })).status).toBe(401);
    }
    expect(native.collector.reads).toBe(0);
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Votre village, votre clé.' })).toBeVisible();
    await expect(page.locator('.project-row')).toHaveCount(0);
    expect(native.collector.reads).toBe(0);
    const { response: enrolled, bearer } = await native.enroll();
    expect(enrolled.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Tableau des opérations' })).toBeVisible();
    await expect(page.locator('.project-row')).toHaveCount(1);
    expect(native.collector.reads).toBeGreaterThan(0);
    const replay = await fetch(`${origin}/api/auth/enroll/verify`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: enrolled.request().postData() });
    expect(replay.status).toBe(409);

    // The existing private ledger stays the only source of goals and validations.
    await page.getByRole('combobox', { name: 'Langue / Language' }).selectOption('en');
    await expect(page.getByRole('heading', { name: 'Operations board' })).toBeVisible();
    await page.locator('.project-row', { hasText: 'Orchard' }).locator('.project-row__main').click();
    await page.getByRole('button', { name: 'Define the goal' }).click();
    await page.getByLabel('Final project goal').fill('Ship a private orchard journal');
    await page.getByLabel('Milestone 1', { exact: true }).fill('Private access');
    await page.getByRole('button', { name: 'Add a milestone' }).click();
    await page.getByLabel('Milestone 2', { exact: true }).fill('Browser acceptance');
    await page.getByRole('button', { name: 'Save the plan' }).click();
    await expect(page.getByRole('complementary').getByText('0/2 milestones validated', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit milestones' }).click();
    await page.getByLabel('Validate milestone 1', { exact: true }).check();
    await page.getByLabel('Validation note 1', { exact: true }).fill('Verified sign-in and anonymous denial');
    await page.getByRole('button', { name: 'Save the plan' }).click();
    await expect(page.getByRole('complementary').getByText('1/2 milestones validated', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close detail' }).click();
    await page.mouse.move(1, 1);
    await page.locator('h1').click();
    // Leaving the reading area applies pending changes, including the saved ledger.
    await expect(page.locator('main.board')).not.toHaveAttribute('data-frozen', 'true');
    await expect(page.locator('.project-row', { hasText: 'Orchard' })).toContainText('1/2 milestones validated');
    await expect(page.locator('.project-row', { hasText: 'Orchard' })).toContainText('Ship a private orchard journal');

    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open my village' })).toBeVisible();
    await expect(page.locator('.project-row')).toHaveCount(0);
    await expect.poll(async () => (await fetch(`${origin}/api/board`, { headers: { authorization: `Bearer ${bearer}` } })).status).toBe(401);
    const login = page.waitForResponse(`${origin}/api/auth/login/verify`);
    await page.getByRole('button', { name: 'Open my village' }).click();
    const loggedIn = await login;
    expect(loggedIn.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Operations board' })).toBeVisible();
    await expect(page.locator('.project-row', { hasText: 'Orchard' })).toContainText('Ship a private orchard journal');
    const loginReplay = await fetch(`${origin}/api/auth/login/verify`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: loggedIn.request().postData() });
    expect(loginReplay.status).toBe(400);
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(stored).not.toContain(bearer);
    expect(stored).not.toContain(native.bootstrap);
    expect(stored).not.toContain('Ship a private orchard journal');
    // Server-side expiry closes the stream (heartbeat check) and locks the page.
    native.clock.offset += 31 * 60_000;
    await expect(page.getByRole('button', { name: 'Open my village' })).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('.project-row')).toHaveCount(0);
    expect(outbound).toEqual([]);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Open my village' })).toBeVisible();
  } finally { await native.close(); }
});

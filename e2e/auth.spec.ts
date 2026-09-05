import { expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createVillageServer, listenLocal } from '../src/server/index.js';
import { OwnerAuth } from '../src/server/auth/ownerAuth.js';
import { prepareOwnerSetup } from '../src/server/auth/privateState.js';
import type { LocalSessions } from '../src/server/activity/localSessions.js';

test('real passkey verifier protects native data, rejects replay and clears the village on logout and expiry', async ({ browser }) => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-village-auth-e2e-'));
  const { bootstrapPath } = prepareOwnerSetup(directory);
  const bootstrap = readFileSync(bootstrapPath, 'utf8').trim();
  let clock = Date.now();
  let reads = 0;
  const ownerAuth = new OwnerAuth(directory, () => clock);
  const server = createVillageServer({ mode: 'native', ownerAuth, villagePath: resolve('fixtures/village.demo.yaml'), distDir: resolve('dist'),
    localSessions: { snapshot: async () => { reads++;
      return { errors: [], sessions: [{ id: 'codex:fictional', tool: 'codex', role: 'lead', state: 'idle', project: 'Orchard', projectKey: 'fictional',
        title: 'Fictional session', history: [{ kind: 'report', at: new Date(clock).toISOString(), text: 'Fictional private report.' }], lastActivityAt: new Date(clock).toISOString() }] };
    } } as unknown as LocalSessions });
  const context = await browser.newContext();
  try {
    await listenLocal(server, 0);
    const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const outbound: string[] = [];
    page.on('request', request => { if (!request.url().startsWith(origin)) outbound.push(new URL(request.url()).origin); });
    expect((await fetch(`${origin}/api/village`)).status).toBe(401);
    expect((await fetch(`${origin}/api/activity`)).status).toBe(401);
    expect(reads).toBe(0);
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Votre village, votre clé.' })).toBeVisible();
    await expect(page.locator('[data-task-id]')).toHaveCount(0);
    expect(reads).toBe(0);
    await page.getByLabel('Code de configuration privé').fill(bootstrap);
    const enrollment = page.waitForResponse(`${origin}/api/auth/enroll/verify`);
    await page.getByRole('button', { name: 'Créer ma clé d’accès' }).click();
    const enrolled = await enrollment;
    expect(enrolled.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Journal du village' })).toBeVisible();
    const bearer = (await enrolled.json()).token as string;
    expect(reads).toBeGreaterThan(0);
    const replay = await fetch(`${origin}/api/auth/enroll/verify`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' }, body: enrolled.request().postData() });
    expect(replay.status).toBe(409);
    await page.getByRole('combobox', { name: 'Langue / Language' }).selectOption('en');
    await expect(page.getByRole('heading', { name: 'Village journal' })).toBeVisible();
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open my village' })).toBeVisible();
    await expect(page.locator('[data-task-id]')).toHaveCount(0);
    await expect.poll(async () => (await fetch(`${origin}/api/village`, { headers: { authorization: `Bearer ${bearer}` } })).status).toBe(401);
    const login = page.waitForResponse(`${origin}/api/auth/login/verify`);
    await page.getByRole('button', { name: 'Open my village' }).click();
    const loggedIn = await login;
    expect(loggedIn.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Village journal' })).toBeVisible();
    const loginReplay = await fetch(`${origin}/api/auth/login/verify`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' }, body: loggedIn.request().postData() });
    expect(loginReplay.status).toBe(400);
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(stored).not.toContain(bearer);
    expect(stored).not.toContain(bootstrap);
    clock += 31 * 60_000;
    await expect(page.getByRole('button', { name: 'Open my village' })).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('[data-task-id]')).toHaveCount(0);
    expect(outbound).toEqual([]);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Open my village' })).toBeVisible();
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    rmSync(directory, { recursive: true, force: true });
  }
});

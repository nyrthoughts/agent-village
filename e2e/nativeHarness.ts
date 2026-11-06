import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { createVillageServer, listenLocal } from '../src/server/index.js';
import { OwnerAuth } from '../src/server/auth/ownerAuth.js';
import { prepareOwnerSetup } from '../src/server/auth/privateState.js';
import { HookActivityStore } from '../src/server/activity/hookStore.js';
import { NativeActivityHub } from '../src/server/activity/nativeActivity.js';
import type { ObservedSession } from '../src/shared/observation.js';

/**
 * Isolated native server for browser tests: an explicit temporary private directory and an
 * injected fictional in-memory collector without `roots` (so no watcher and no file read).
 * Nothing reads the real Codex or Claude history, and no environment variable is changed.
 */
export async function startNative(browser: Browser, options: { heartbeatMs?: number; pollMs?: number; sessions?: ObservedSession[] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'agent-village-native-e2e-'));
  const { bootstrapPath, hookHeaderPath } = prepareOwnerSetup(directory);
  const bootstrap = readFileSync(bootstrapPath, 'utf8').trim();
  const ingestion = readFileSync(hookHeaderPath, 'utf8').trim().replace(/^Authorization: /, '');
  const clock = { now: Date.now(), offset: 0 };
  const ownerAuth = new OwnerAuth(directory, () => Date.now() + clock.offset);
  const collector = {
    reads: 0,
    failing: false,
    sessions: options.sessions ?? [fictionalSession()],
    async snapshot() {
      this.reads++;
      if (this.failing) throw new Error('fictional collector failure');
      return { errors: [], sessions: this.sessions };
    },
  };
  const hooks = new HookActivityStore();
  const server = createVillageServer({ mode: 'native', ownerAuth, villagePath: resolve('fixtures/village.demo.yaml'), distDir: resolve('dist'),
    localSessions: collector as never, nativeActivity: new NativeActivityHub([], undefined, hooks),
    nativeBoard: { watch: false, pollMs: options.pollMs ?? 1_000 }, streamHeartbeatMs: options.heartbeatMs ?? 1_000 });
  await listenLocal(server, 0);
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  const context: BrowserContext = await browser.newContext();
  const page: Page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const hook = (session: string, event = 'UserPromptSubmit', cwd = '/fictional/latency', delivery: Record<string, string> = {}) => fetch(`${origin}/api/hooks/claude`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: ingestion, ...delivery },
    body: JSON.stringify({ session_id: session, hook_event_name: event, cwd, prompt: 'fictional private prompt' }) });
  const enroll = async () => {
    await page.goto(origin);
    await page.getByLabel('Code de configuration privé').fill(bootstrap);
    const enrolled = page.waitForResponse(`${origin}/api/auth/enroll/verify`);
    await page.getByRole('button', { name: 'Créer ma clé d’accès' }).click();
    const response = await enrolled;
    return { response, bearer: (await response.json()).token as string };
  };
  const close = async () => {
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(directory, { recursive: true, force: true });
  };
  return { origin, page, context, collector, clock, hook, enroll, bootstrap, ingestion, close };
}

export function fictionalSession(overrides: Partial<ObservedSession> = {}): ObservedSession {
  const at = new Date(Date.now() - 60_000).toISOString();
  return { id: 'claude:fictional-orchard', tool: 'claude', role: 'lead', state: 'idle', projectKey: 'fictional-orchard-root', project: 'Orchard', title: 'Fictional orchard task',
    lastActivityAt: at, activityEvidence: { level: 'detected', source: 'claude-journal', observedAt: at },
    history: [{ at, kind: 'report', text: 'Fictional orchard report: the map renders.' }], ...overrides };
}

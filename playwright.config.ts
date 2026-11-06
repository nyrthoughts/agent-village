import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices } from '@playwright/test';

// CI installs Playwright's Chromium. Local machines without it fall back to an installed Chrome
// (Playwright always uses a fresh temporary profile).
const bundledChromium = (() => { try { return existsSync(chromium.executablePath()); } catch { return false; } })();

// A dedicated port so tests never collide with a local village on the default 4180.
const port = process.env.PLAYWRIGHT_PORT ?? '4286';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL === 'chrome' || !bundledChromium ? 'chrome' : undefined,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VILLAGE_MODE: 'demo', PORT: port },
  },
});

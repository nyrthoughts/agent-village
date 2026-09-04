import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createVillageServer, listenLocal } from './index.js';

const fixturePath = resolve('fixtures/village.demo.yaml');
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function start(villagePath = fixturePath) {
  const distDir = mkdtempSync(join(tmpdir(), 'agent-village-dist-'));
  mkdirSync(join(distDir, 'assets'));
  writeFileSync(join(distDir, 'index.html'), '<main>Village shell</main>', 'utf8');
  writeFileSync(join(distDir, 'assets', 'app.js'), 'export {};', 'utf8');
  const server = createVillageServer({ villagePath, distDir });
  await listenLocal(server, 0);
  cleanups.push(async () => {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    rmSync(distDir, { recursive: true, force: true });
  });
  const address = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function rawStatus(origin: string, path: string, headers?: Record<string, string>): Promise<number> {
  const url = new URL(origin);
  return new Promise((resolveStatus, reject) => {
    const outgoing = request(
      { hostname: url.hostname, port: url.port, path, method: 'GET', headers },
      (response) => {
        response.resume();
        response.on('end', () => resolveStatus(response.statusCode ?? 0));
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

describe('local village server', () => {
  it('rejects foreign origins and hosts before exposing private native data', async () => {
    const server = createVillageServer({ villagePath: fixturePath, distDir: '/tmp', mode: 'native' });
    await listenLocal(server, 0);
    cleanups.push(() => new Promise<void>((done) => server.close(() => done())));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${origin}/api/health`, { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect(await rawStatus(origin, '/api/health', { host: 'evil.example' })).toBe(403);
    expect((await fetch(`${origin}/api/health`, { headers: { origin } })).status).toBe(200);
  });
  it('serves health and an evidence-derived village snapshot', async () => {
    const { origin } = await start();
    await expect(fetch(`${origin}/api/health`).then((response) => response.json())).resolves.toEqual({ ok: true });

    const response = await fetch(`${origin}/api/village`);
    const body = await response.json() as { name: string; projects: unknown[] };
    expect(response.status).toBe(200);
    expect(body.name).toBe('Verdant Labs');
    expect(body.projects).toHaveLength(2);
  });

  it('returns structured invalid-config errors', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-village-config-'));
    const invalidPath = join(directory, 'village.yaml');
    writeFileSync(invalidPath, 'version: 2\nname: Broken\nprojects: []\n', 'utf8');
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const { origin } = await start(invalidPath);

    const response = await fetch(`${origin}/api/village`);
    const body = await response.json() as { error: string; errors: Array<{ path: string }> };
    expect(response.status).toBe(422);
    expect(body.error).toBe('invalid_config');
    expect(body.errors[0]).toHaveProperty('path');
  });

  it('keeps API 404s separate from the SPA fallback', async () => {
    const { origin } = await start();
    const api = await fetch(`${origin}/api/missing`);
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'not_found' });

    const spa = await fetch(`${origin}/projects/atlas`);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain('Village shell');
  });

  it('serves static assets with their content type', async () => {
    const { origin } = await start();
    const response = await fetch(`${origin}/assets/app.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
  });

  it('rejects encoded traversal before resolving a static path', async () => {
    const { origin } = await start();
    await expect(rawStatus(origin, '/%2e%2e/secret')).resolves.toBe(400);
  });

  it('binds only to the IPv4 loopback address', async () => {
    const { server } = await start();
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });
});

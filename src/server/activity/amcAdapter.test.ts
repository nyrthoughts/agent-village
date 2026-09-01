import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityMapping } from '../../shared/schema.js';
import { AMC_TIMEOUT_MS, fetchAmcActivity } from './amcAdapter.js';

const nominal = readFileSync(resolve('fixtures/amc/dashboard.nominal.json'), 'utf8');
const empty = readFileSync(resolve('fixtures/amc/dashboard.empty.json'), 'utf8');
const malformed = readFileSync(resolve('fixtures/amc/dashboard.malformed.json'), 'utf8');
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

async function endpoint(body?: string): Promise<string> {
  const server = createServer((_request, response) => {
    if (body === undefined) return;
    response.setHeader('content-type', 'application/json');
    response.end(body);
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/dashboard`;
}

const mappings: ActivityMapping[] = [
  { match: 'atlas contours', taskId: 'atlas-contours' },
  { match: 'atlas observatory', taskId: 'atlas-observatory' },
  { match: 'beacon relay', taskId: 'beacon-relay' },
];

describe('fetchAmcActivity', () => {
  it('allowlists, redacts and explicitly maps nominal workers', async () => {
    const snapshot = await fetchAmcActivity({
      endpoint: await endpoint(nominal),
      mappings,
      now: () => new Date('2026-08-31T16:00:00.000Z'),
    });

    expect(snapshot.status).toBe('live');
    expect(snapshot.workers.map((worker) => worker.attachedTaskId)).toEqual([
      'atlas-contours',
      'atlas-observatory',
      'beacon-relay',
    ]);
    expect(snapshot.workers.map((worker) => worker.tool)).toEqual(['codex', 'claude', 'openclaw']);

    const encoded = JSON.stringify(snapshot);
    for (const forbidden of ['message', 'messages', 'tokens', 'tokenCount', 'cost', 'cwd', 'credential', '/tmp/']) {
      expect(encoded).not.toContain(forbidden);
    }
    expect(Object.keys(snapshot).sort()).toEqual(['fetchedAt', 'status', 'workers']);
    for (const worker of snapshot.workers) {
      expect(Object.keys(worker).sort()).toEqual([
        'attachedTaskId', 'id', 'lastActivityAt', 'state', 'title', 'tool',
      ]);
    }
  });

  it('returns a live empty snapshot for an empty dashboard', async () => {
    const snapshot = await fetchAmcActivity({ endpoint: await endpoint(empty), mappings });
    expect(snapshot.status).toBe('live');
    expect(snapshot.workers).toEqual([]);
  });

  it('degrades on a malformed dashboard', async () => {
    const snapshot = await fetchAmcActivity({ endpoint: await endpoint(malformed), mappings });
    expect(snapshot.status).toBe('degraded');
    expect(snapshot.workers).toEqual([]);
  });

  it('uses an 800 ms timeout and degrades when AMC does not answer', async () => {
    expect(AMC_TIMEOUT_MS).toBe(800);
    const started = Date.now();
    const snapshot = await fetchAmcActivity({ endpoint: await endpoint(), mappings });
    expect(snapshot.status).toBe('degraded');
    expect(Date.now() - started).toBeGreaterThanOrEqual(700);
  });

  it('rejects non-local endpoints before fetching', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const snapshot = await fetchAmcActivity({
      endpoint: 'https://example.invalid/api/dashboard',
      mappings,
      fetchImpl,
    });
    expect(snapshot.status).toBe('degraded');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

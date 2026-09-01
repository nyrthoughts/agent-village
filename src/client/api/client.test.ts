import { describe, expect, it, vi } from 'vitest';
import { fetchActivity, fetchVillage } from './client.js';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('static demo fallback', () => {
  it('loads the exported village when the local API is absent', async () => {
    const demo = { name: 'Verdant Labs', projects: [] };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(404, { error: 'not_found' }))
      .mockResolvedValueOnce(response(200, demo));

    await expect(fetchVillage(fetchImpl)).resolves.toEqual(demo);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      '/demo/village.json',
      { headers: { accept: 'application/json' } },
    );
  });

  it('loads exported activity when the local API is absent', async () => {
    const demo = { status: 'demo', fetchedAt: '2026-08-31T15:00:00.000Z', workers: [] };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(404, { error: 'not_found' }))
      .mockResolvedValueOnce(response(200, demo));

    await expect(fetchActivity(fetchImpl)).resolves.toEqual(demo);
  });

  it('loads the exported village when a static host returns its HTML shell for the API path', async () => {
    const demo = { name: 'Verdant Labs', projects: [] };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<!doctype html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }))
      .mockResolvedValueOnce(response(200, demo));

    await expect(fetchVillage(fetchImpl)).resolves.toEqual(demo);
  });

  it('does not hide API validation failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(422, { error: 'invalid_config' }));

    await expect(fetchVillage(fetchImpl)).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      message: 'invalid_config',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

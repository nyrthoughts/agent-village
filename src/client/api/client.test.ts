import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBoard, saveMapping, saveProjectPlan } from './client.js';
import { clearSession, getSession, setSession } from './session.js';

afterEach(() => clearSession());

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('board client', () => {
  it('writes only to the same-origin plan endpoint and preserves conflicts without static fallback', async () => {
    setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(409, { error: 'plan_conflict' }));
    const plan = { objective: 'Ship', milestones: [{ id: 'one', title: 'Review', validated: false, note: '' }] };
    await expect(saveProjectPlan('project-aaaaaaaaaaaa', plan, 2, fetchImpl)).rejects.toMatchObject({ status: 409 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith('/api/plan', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: `Bearer ${'a'.repeat(43)}`, 'content-type': 'application/json' }), body: JSON.stringify({ projectId: 'project-aaaaaaaaaaaa', plan, revision: 2 }) }));
    expect(getSession()).not.toBeNull();
  });

  it('posts an owner mapping with the bearer and no static fallback', async () => {
    setSession({ token: 'b'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(200, { ok: true }));
    await saveMapping('claude:fictional', 'project-aaaaaaaaaaaa', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/api/mappings', expect.objectContaining({ method: 'POST', body: JSON.stringify({ sessionId: 'claude:fictional', projectId: 'project-aaaaaaaaaaaa' }),
      headers: expect.objectContaining({ authorization: `Bearer ${'b'.repeat(43)}` }) }));
  });

  it('sends the memory-only bearer to the native board and locks on 401 without loading a demo', async () => {
    setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(401, { error: 'unauthorized' }));
    await expect(fetchBoard(fetchImpl)).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledWith('/api/board', { headers: { accept: 'application/json', authorization: `Bearer ${'a'.repeat(43)}` } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getSession()).toBeNull();
  });

  it('loads the exported fictional board when the local API is absent', async () => {
    const demo = { fictional: true, seq: 3 };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(404, { error: 'not_found' }))
      .mockResolvedValueOnce(response(200, demo));
    await expect(fetchBoard(fetchImpl)).resolves.toEqual(demo);
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/demo/board.json', { headers: { accept: 'application/json' } });
  });

  it('loads the exported board when a static host returns its HTML shell for the API path', async () => {
    const demo = { fictional: true, seq: 3 };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }))
      .mockResolvedValueOnce(response(200, demo));
    await expect(fetchBoard(fetchImpl)).resolves.toEqual(demo);
  });

  it('does not hide API failures behind the demo', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response(503, { error: 'board_unavailable' }));
    await expect(fetchBoard(fetchImpl)).rejects.toMatchObject({ name: 'ApiError', status: 503, message: 'board_unavailable' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

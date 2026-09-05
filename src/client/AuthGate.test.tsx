import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { AuthGate, canonicalLocalUrl } from './AuthGate.js';
import { clearSession, getSession } from './api/session.js';

vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: vi.fn(), startRegistration: vi.fn() }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const status = (enrolled = true) => ({ native: true, enrolled, bootstrapReady: true, canonicalOrigin: window.location.origin, sessionMinutes: 30 });
beforeEach(() => { localStorage.clear(); vi.stubGlobal('PublicKeyCredential', class {}); });
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('does not mount private content before authentication and fails closed on an unavailable status', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'auth_unavailable' }, 503));
  render(<AuthGate fetchImpl={fetchImpl}><p>PRIVATE REPORT</p></AuthGate>);
  expect(screen.queryByText('PRIVATE REPORT')).toBeNull();
  await screen.findByRole('alert');
  expect(screen.queryByText('PRIVATE REPORT')).toBeNull();
});
it('unlocks using a passkey and unmounts private content immediately when the session is cleared', async () => {
  vi.mocked(startAuthentication).mockResolvedValue({ id: 'credential' } as Awaited<ReturnType<typeof startAuthentication>>);
  const fetchImpl = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(json(status()))
    .mockResolvedValueOnce(json({ challengeId: 'challenge', options: {} }))
    .mockResolvedValueOnce(json({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() }));
  render(<AuthGate fetchImpl={fetchImpl}><p>PRIVATE REPORT</p></AuthGate>);
  fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir mon village' }));
  await screen.findByText('PRIVATE REPORT');
  expect(getSession()).not.toBeNull();
  expect(JSON.stringify(localStorage)).not.toContain('a'.repeat(43));
  act(() => window.dispatchEvent(new CustomEvent('agent-village:language', { detail: 'en' })));
  expect(screen.getByRole('button', { name: 'Lock' })).toBeTruthy();
  act(() => clearSession());
  expect(screen.queryByText('PRIVATE REPORT')).toBeNull();
});
it('offers English before login and persists only the language choice', async () => {
  render(<AuthGate fetchImpl={vi.fn<typeof fetch>().mockResolvedValue(json(status()))}><p>PRIVATE REPORT</p></AuthGate>);
  fireEvent.change(screen.getByRole('combobox', { name: 'Langue / Language' }), { target: { value: 'en' } });
  await screen.findByRole('button', { name: 'Open my village' });
  expect(localStorage.getItem('agent-village:language')).toBe('en');
  expect(document.documentElement.lang).toBe('en');
});
it('requires a private setup code before enrolling the first owner', async () => {
  render(<AuthGate fetchImpl={vi.fn<typeof fetch>().mockResolvedValue(json(status(false)))}><p>PRIVATE REPORT</p></AuthGate>);
  const button = await screen.findByRole('button', { name: 'Créer ma clé d’accès' });
  expect(button).toHaveProperty('disabled', true);
  expect(screen.getByLabelText('Code de configuration privé')).toHaveProperty('type', 'password');
  expect(startRegistration).not.toHaveBeenCalled();
});
it('does not request private auth on the public static demo', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  render(<AuthGate basePath="/agent-village/" fetchImpl={fetchImpl}><p>FICTIONAL DEMO</p></AuthGate>);
  await screen.findByText('FICTIONAL DEMO');
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('only allows a same-port canonical localhost redirect', () => {
  expect(canonicalLocalUrl('http://localhost:4180', 'http://127.0.0.1:4180/')).toBe('http://localhost:4180/');
  expect(() => canonicalLocalUrl('https://attacker.example', 'http://127.0.0.1:4180/')).toThrow();
  expect(() => canonicalLocalUrl('http://localhost:4199', 'http://127.0.0.1:4180/')).toThrow();
});

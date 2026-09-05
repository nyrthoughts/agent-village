import { afterEach, expect, it } from 'vitest';
import { clearSession, getSession, setSession, sessionHeaders } from './session.js';

afterEach(() => { clearSession(); localStorage.clear(); });
it('keeps bearer sessions in memory and attaches them only to local API paths', () => {
  setSession({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
  expect(sessionHeaders('/api/village')).toEqual({ authorization: `Bearer ${'a'.repeat(43)}` });
  expect(sessionHeaders('/demo/village.json')).toEqual({});
  expect(sessionHeaders('https://example.com/api/village')).toEqual({});
  expect(localStorage.length).toBe(0);
  clearSession();
  expect(getSession()).toBeNull();
});
it('rejects expired sessions and an older request cannot clear a newer login', () => {
  expect(() => setSession({ token: 'a'.repeat(43), expiresAt: '2020-01-01T00:00:00Z' })).toThrow();
  setSession({ token: 'b'.repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() });
  clearSession('a'.repeat(43));
  expect(getSession()?.token).toBe('b'.repeat(43));
});

export interface OwnerSession { token: string; expiresAt: string }
let current: OwnerSession | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
export function getSession(): OwnerSession | null { return current; }
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setSession(session: OwnerSession): void {
  const remaining = Date.parse(session.expiresAt) - Date.now();
  if (!/^[A-Za-z0-9_-]{43}$/.test(session.token) || !Number.isFinite(remaining) || remaining <= 0 || remaining > 30 * 60_000) {
    throw new Error('Invalid owner session');
  }
  clearTimeout(expiry);
  current = { ...session };
  expiry = setTimeout(() => clearSession(session.token), remaining);
  for (const listener of listeners) listener();
}
export function clearSession(expectedToken?: string): void {
  if (expectedToken && current?.token !== expectedToken) return;
  clearTimeout(expiry);
  current = null;
  for (const listener of listeners) listener();
}
export function sessionHeaders(path: string): Record<string, string> {
  if (current && Date.parse(current.expiresAt) <= Date.now()) clearSession();
  return current && /^\/api\/[a-z/]+$/.test(path) ? { authorization: `Bearer ${current.token}` } : {};
}

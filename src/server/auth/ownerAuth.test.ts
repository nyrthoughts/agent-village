import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { OwnerAuth } from './ownerAuth.js';
import { prepareOwnerSetup, readPrivateFile, sourceRepositoryRoot } from './privateState.js';

vi.mock('@simplewebauthn/server', async (original) => ({
  ...await original<typeof import('@simplewebauthn/server')>(),
  verifyRegistrationResponse: vi.fn(), verifyAuthenticationResponse: vi.fn(),
}));
const registration = { verified: true, registrationInfo: { credential: {
  id: 'dGVzdC1jcmVkZW50aWFs', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'],
} } } as Awaited<ReturnType<typeof verifyRegistrationResponse>>;
const dirs: string[] = [];
const origin = 'http://localhost:4180';
beforeEach(() => {
  vi.mocked(verifyRegistrationResponse).mockReset().mockResolvedValue(registration);
  vi.mocked(verifyAuthenticationResponse).mockReset().mockResolvedValue({ verified: true,
    authenticationInfo: { newCounter: 1 } } as Awaited<ReturnType<typeof verifyAuthenticationResponse>>);
});
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'village-owner-test-'));
  dirs.push(directory);
  const paths = prepareOwnerSetup(directory);
  let clock = Date.now();
  const auth = new OwnerAuth(directory, () => clock);
  const bootstrapToken = readFileSync(paths.bootstrapPath, 'utf8').trim();
  const header = readFileSync(paths.hookHeaderPath, 'utf8').trim().replace(/^Authorization: /, '');
  return { auth, directory, paths, bootstrapToken, header, advance: (ms: number) => { clock += ms; } };
}
async function enroll(test: ReturnType<typeof setup>) {
  const challenge = await test.auth.enrollOptions(test.bootstrapToken, origin);
  return test.auth.enrollVerify({ bootstrapToken: test.bootstrapToken, challengeId: challenge.challengeId, response: {} }, origin);
}
async function login(auth: OwnerAuth) {
  const challenge = await auth.loginOptions(origin);
  return auth.loginVerify({ challengeId: challenge.challengeId, response: { id: 'dGVzdC1jcmVkZW50aWFs' } }, origin);
}

describe('owner-only authentication lifecycle', () => {
  it('prepares private bootstrap/ingestion files, never returning either secret', () => {
    const test = setup();
    expect(statSync(test.directory).mode & 0o777).toBe(0o700);
    expect(statSync(test.paths.bootstrapPath).mode & 0o777).toBe(0o600);
    expect(statSync(test.paths.hookHeaderPath).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(test.paths)).not.toContain(test.bootstrapToken);
    expect(test.auth.status()).toEqual({ enrolled: false, bootstrapReady: true, sessionMinutes: 30 });
  });

  it('requires proof of local ownership before any enrollment challenge', async () => {
    const test = setup();
    await expect(test.auth.enrollOptions(undefined, origin)).rejects.toMatchObject({ code: 'invalid_bootstrap' });
    await expect(test.auth.enrollOptions('x'.repeat(43), origin)).rejects.toMatchObject({ code: 'invalid_bootstrap' });
    test.advance(15 * 60_000 + 1_000);
    await expect(test.auth.enrollOptions(test.bootstrapToken, origin)).rejects.toMatchObject({ code: 'invalid_bootstrap' });
  });

  it('requires user verification and binds successful enrollment to the exact origin/challenge/RP', async () => {
    const test = setup();
    const challenge = await test.auth.enrollOptions(test.bootstrapToken, origin);
    expect(challenge.options.rp.id).toBe('localhost');
    expect(challenge.options.authenticatorSelection?.userVerification).toBe('required');
    const session = await test.auth.enrollVerify({ bootstrapToken: test.bootstrapToken, challengeId: challenge.challengeId, response: {} }, origin);
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({ requireUserVerification: true,
      expectedRPID: 'localhost', expectedOrigin: origin, expectedChallenge: challenge.options.challenge }));
    expect(() => test.auth.authorize(`Bearer ${session.token}`)).not.toThrow();
    expect(test.auth.status()).toMatchObject({ enrolled: true, bootstrapReady: false });
    expect(readPrivateFile(test.paths.bootstrapPath)).toBeUndefined();
    expect(statSync(join(test.directory, 'owner.json')).mode & 0o777).toBe(0o600);
    await expect(test.auth.enrollOptions(test.bootstrapToken, origin)).rejects.toMatchObject({ code: 'already_enrolled' });
    expect(() => prepareOwnerSetup(test.directory)).toThrow('already enrolled');
  });

  it('does not enroll when WebAuthn verification fails and burns the challenge', async () => {
    const test = setup();
    const challenge = await test.auth.enrollOptions(test.bootstrapToken, origin);
    vi.mocked(verifyRegistrationResponse).mockRejectedValueOnce(new Error('Bad signature'));
    const input = { bootstrapToken: test.bootstrapToken, challengeId: challenge.challengeId, response: {} };
    await expect(test.auth.enrollVerify(input, origin)).rejects.toMatchObject({ code: 'verification_failed' });
    await expect(test.auth.enrollVerify(input, origin)).rejects.toMatchObject({ code: 'invalid_challenge' });
    expect(test.auth.status().enrolled).toBe(false);
  });

  it('refuses login challenge replay, expiry, unknown credentials and a different port', async () => {
    const test = setup(); await enroll(test);
    const challenge = await test.auth.loginOptions(origin);
    const input = { challengeId: challenge.challengeId, response: { id: 'other-credential' } };
    await expect(test.auth.loginVerify(input, origin)).rejects.toMatchObject({ code: 'verification_failed' });
    await expect(test.auth.loginVerify(input, origin)).rejects.toMatchObject({ code: 'invalid_challenge' });
    const crossPort = await test.auth.loginOptions(origin);
    await expect(test.auth.loginVerify({ challengeId: crossPort.challengeId, response: {} }, 'http://localhost:4444'))
      .rejects.toMatchObject({ code: 'invalid_challenge' });
    const expired = await test.auth.loginOptions(origin); test.advance(2 * 60_000);
    await expect(test.auth.loginVerify({ challengeId: expired.challengeId, response: {} }, origin)).rejects.toMatchObject({ code: 'invalid_challenge' });
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it('rotates sessions, rejects ingestion as owner access, expires and revokes sessions', async () => {
    const test = setup(); const first = await enroll(test); const second = await login(test.auth);
    expect(() => test.auth.authorize(`Bearer ${first.token}`)).toThrow('unauthorized');
    expect(() => test.auth.authorize(test.header)).toThrow('unauthorized');
    expect(() => test.auth.authorizeHook(`Bearer ${second.token}`)).toThrow('unauthorized');
    expect(() => test.auth.authorizeHook(test.header)).not.toThrow();
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({ requireUserVerification: true,
      expectedRPID: 'localhost', expectedOrigin: origin }));
    test.advance(30 * 60_000);
    expect(() => test.auth.authorize(`Bearer ${second.token}`)).toThrow('session_expired');
    const third = await login(test.auth);
    expect(test.auth.logout(`Bearer ${third.token}`)).toEqual({ ok: true });
    expect(() => test.auth.authorize(`Bearer ${third.token}`)).toThrow('unauthorized');
    expect(() => new OwnerAuth(test.directory).authorize(`Bearer ${third.token}`)).toThrow('unauthorized');
  });

  it('fails closed on permission changes, removed or corrupt owner configuration', async () => {
    const test = setup(); const session = await enroll(test);
    const path = join(test.directory, 'owner.json');
    chmodSync(path, 0o644);
    expect(() => test.auth.authorize(`Bearer ${session.token}`)).toThrow('private regular');
    chmodSync(path, 0o600); unlinkSync(path);
    expect(() => test.auth.authorize(`Bearer ${session.token}`)).toThrow('auth_unavailable');
    writeFileSync(path, '{}', { mode: 0o600 });
    expect(() => new OwnerAuth(test.directory)).toThrow();
  });

  it('rejects symlinked and broadly readable private files', () => {
    const test = setup();
    unlinkSync(test.paths.bootstrapPath); symlinkSync(test.paths.hookHeaderPath, test.paths.bootstrapPath);
    expect(() => test.auth.status()).toThrow();
    chmodSync(test.paths.hookHeaderPath, 0o644);
    expect(() => new OwnerAuth(test.directory)).toThrow('private regular');
  });

  it('refuses to prepare private state inside the source repository', () => {
    const forbidden = fileURLToPath(new URL('../../../', import.meta.url));
    expect(() => prepareOwnerSetup(join(forbidden, 'forbidden-private-state'))).toThrow('outside the source repository');
  });

  it('does not mistake a bundled distribution ancestor for a source repository', () => {
    const test = setup();
    const bundledUrl = pathToFileURL(join(test.directory, 'Application Support', 'Agent Village', 'server.mjs')).href;
    expect(sourceRepositoryRoot(bundledUrl)).toBeUndefined();
    expect(sourceRepositoryRoot(import.meta.url)).toBe(fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, ''));
    expect(test.auth.status().bootstrapReady).toBe(true);
  });

  it('caps unauthenticated challenges and ingestion rate without unbounded maps', async () => {
    const test = setup();
    for (let i = 0; i < 30; i++) await test.auth.enrollOptions(test.bootstrapToken, origin);
    await expect(test.auth.enrollOptions(test.bootstrapToken, origin)).rejects.toMatchObject({ code: 'rate_limited' });
    for (let i = 0; i < 240; i++) test.auth.limit('hook');
    expect(() => test.auth.limit('hook')).toThrow('rate_limited');
    test.advance(60_000);
    expect(() => test.auth.limit('hook')).not.toThrow();
  });
});

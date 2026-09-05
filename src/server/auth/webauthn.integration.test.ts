import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { afterEach, describe, expect, it } from 'vitest';
import { OwnerAuth } from './ownerAuth.js';
import { prepareOwnerSetup } from './privateState.js';

// A software authenticator for protocol verification. This never represents the owner's real passkey.
const origin = 'http://localhost:4180';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest();
function authenticator() {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = keys.publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(16);
  const id = credentialId.toString('base64url');
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
    [1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))],
    [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))],
  ]));
  function register(challenge: string, settings: { origin?: string; rpID?: string; uv?: boolean } = {}): RegistrationResponseJSON {
    const length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length);
    const authData = Buffer.concat([hash(settings.rpID ?? 'localhost'), Buffer.from([settings.uv === false ? 0x41 : 0x45]),
      Buffer.alloc(4), Buffer.alloc(16), length, credentialId, cose]);
    const attestation = isoCBOR.encode(new Map<string, string | Uint8Array | Map<string, never>>([
      ['fmt', 'none'], ['authData', new Uint8Array(authData)], ['attStmt', new Map<string, never>()],
    ]));
    return { id, rawId: id, type: 'public-key', clientExtensionResults: {}, response: {
      attestationObject: Buffer.from(attestation).toString('base64url'), transports: ['internal'],
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: settings.origin ?? origin })).toString('base64url'),
    } };
  }
  function authenticate(challenge: string, count: number, settings: { origin?: string; rpID?: string; uv?: boolean; badSignature?: boolean } = {}): AuthenticationResponseJSON {
    const counter = Buffer.alloc(4); counter.writeUInt32BE(count);
    const authData = Buffer.concat([hash(settings.rpID ?? 'localhost'), Buffer.from([settings.uv === false ? 1 : 5]), counter]);
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: settings.origin ?? origin }));
    const signature = sign('sha256', Buffer.concat([authData, hash(clientData)]), keys.privateKey);
    if (settings.badSignature) signature[signature.length - 1] = signature[signature.length - 1]! ^ 1;
    return { id, rawId: id, type: 'public-key', clientExtensionResults: {}, response: {
      authenticatorData: authData.toString('base64url'), clientDataJSON: clientData.toString('base64url'), signature: signature.toString('base64url'),
    } };
  }
  return { id, register, authenticate };
}
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'village-webauthn-real-test-')); dirs.push(directory);
  const { bootstrapPath } = prepareOwnerSetup(directory);
  return { auth: new OwnerAuth(directory), bootstrapToken: readFileSync(bootstrapPath, 'utf8').trim(), device: authenticator() };
}
async function enroll(test: ReturnType<typeof setup>) {
  const challenge = await test.auth.enrollOptions(test.bootstrapToken, origin);
  return test.auth.enrollVerify({ bootstrapToken: test.bootstrapToken, challengeId: challenge.challengeId,
    response: test.device.register(challenge.options.challenge) }, origin);
}

describe('real WebAuthn verification with ephemeral ES256 credentials', () => {
  it('enrolls, checks a real assertion signature, persists its counter, and rejects replay', async () => {
    const test = setup(); const initial = await enroll(test);
    expect(() => test.auth.authorize(`Bearer ${initial.token}`)).not.toThrow();
    const challenge = await test.auth.loginOptions(origin);
    const input = { challengeId: challenge.challengeId, response: test.device.authenticate(challenge.options.challenge, 1) };
    const session = await test.auth.loginVerify(input, origin);
    expect(() => test.auth.authorize(`Bearer ${session.token}`)).not.toThrow();
    await expect(test.auth.loginVerify(input, origin)).rejects.toMatchObject({ code: 'invalid_challenge' });
    const duplicateCounter = await test.auth.loginOptions(origin);
    await expect(test.auth.loginVerify({ challengeId: duplicateCounter.challengeId,
      response: test.device.authenticate(duplicateCounter.options.challenge, 1) }, origin)).rejects.toMatchObject({ code: 'verification_failed' });
  });

  it.each([{ uv: false }, { rpID: 'evil.example' }, { origin: 'http://localhost:9999' }])('rejects registration violating %j', async (settings) => {
    const test = setup();
    const challenge = await test.auth.enrollOptions(test.bootstrapToken, origin);
    await expect(test.auth.enrollVerify({ bootstrapToken: test.bootstrapToken, challengeId: challenge.challengeId,
      response: test.device.register(challenge.options.challenge, settings) }, origin)).rejects.toMatchObject({ code: 'verification_failed' });
    expect(test.auth.status().enrolled).toBe(false);
  });

  it.each([{ uv: false }, { rpID: 'evil.example' }, { origin: 'http://localhost:9999' }, { badSignature: true }])('rejects signed assertions violating %j', async (settings) => {
    const test = setup(); await enroll(test);
    const challenge = await test.auth.loginOptions(origin);
    await expect(test.auth.loginVerify({ challengeId: challenge.challengeId,
      response: test.device.authenticate(challenge.options.challenge, 1, settings) }, origin)).rejects.toMatchObject({ code: 'verification_failed' });
  });
});

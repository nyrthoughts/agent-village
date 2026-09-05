import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { BOOTSTRAP_TTL_MS, ensurePrivateDirectory, readPrivateFile, writePrivateFile } from './privateState.js';

export const SESSION_MINUTES = 30;
const CHALLENGE_TTL_MS = 2 * 60_000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const base64url = z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/);
const ownerSchema = z.object({
  version: z.literal(1), rpID: z.literal('localhost'), userId: base64url,
  credential: z.object({ id: base64url, publicKey: base64url, counter: z.number().int().nonnegative(),
    transports: z.array(z.enum(['usb', 'nfc', 'ble', 'internal', 'cable', 'hybrid', 'smart-card'])).optional(),
  }).strict(),
}).strict();
type Owner = z.infer<typeof ownerSchema>;
type Challenge = { kind: 'enroll' | 'login'; challenge: string; origin: string; expiresAt: number; userId?: string };

export class AuthError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function digest(value: string): Buffer { return createHash('sha256').update(value).digest(); }
function sameSecret(value: unknown, expected: string): boolean {
  return typeof value === 'string' && tokenPattern.test(value) && timingSafeEqual(digest(value), digest(expected));
}

export class OwnerAuth {
  readonly directory: string;
  readonly #challenges = new Map<string, Challenge>();
  readonly #sessions = new Map<string, number>();
  #enrolling = false;
  #authenticating = false;
  #authWindow = { start: 0, count: 0 };
  #hookWindow = { start: 0, count: 0 };

  constructor(directory: string, private readonly now: () => number = Date.now) {
    this.directory = ensurePrivateDirectory(directory);
    this.owner(); // Corrupted configuration must fail startup, never enable legacy access.
    this.ingestionToken();
  }

  private owner(): Owner | undefined {
    const file = readPrivateFile(join(this.directory, 'owner.json'));
    return file ? ownerSchema.parse(JSON.parse(file.text)) : undefined;
  }

  private ingestionToken(): string | undefined {
    const file = readPrivateFile(join(this.directory, 'ingestion.header'));
    if (!file) return undefined;
    const match = /^Authorization: Bearer ([A-Za-z0-9_-]{43})\n?$/.exec(file.text);
    if (!match) throw new Error('Invalid private ingestion header');
    return match[1];
  }

  status() {
    const enrolled = !!this.owner();
    const bootstrap = enrolled ? undefined : readPrivateFile(join(this.directory, 'bootstrap.txt'));
    return { enrolled, sessionMinutes: SESSION_MINUTES,
      bootstrapReady: !!bootstrap && tokenPattern.test(bootstrap.text.trim())
        && this.now() - bootstrap.modifiedAt < BOOTSTRAP_TTL_MS };
  }

  private bootstrap(value: unknown): void {
    if (this.owner()) throw new AuthError(409, 'already_enrolled');
    const file = readPrivateFile(join(this.directory, 'bootstrap.txt'));
    if (!file) throw new AuthError(403, 'bootstrap_required');
    if (this.now() - file.modifiedAt >= BOOTSTRAP_TTL_MS || !sameSecret(value, file.text.trim())) {
      throw new AuthError(403, 'invalid_bootstrap');
    }
  }

  limit(kind: 'auth' | 'hook'): void {
    const window = kind === 'auth' ? this.#authWindow : this.#hookWindow;
    if (this.now() - window.start >= 60_000) { window.start = this.now(); window.count = 0; }
    if (++window.count > (kind === 'auth' ? 30 : 240)) throw new AuthError(429, 'rate_limited');
  }

  private addChallenge(value: Omit<Challenge, 'expiresAt'>): string {
    for (const [id, challenge] of this.#challenges) if (challenge.expiresAt <= this.now()) this.#challenges.delete(id);
    if (this.#challenges.size >= 30) throw new AuthError(429, 'rate_limited');
    const id = randomBytes(32).toString('base64url');
    this.#challenges.set(id, { ...value, expiresAt: this.now() + CHALLENGE_TTL_MS });
    return id;
  }

  private takeChallenge(id: unknown, kind: Challenge['kind'], origin: string): Challenge {
    const challenge = typeof id === 'string' ? this.#challenges.get(id) : undefined;
    if (typeof id === 'string') this.#challenges.delete(id); // Burn on every verification attempt, including failure.
    if (!challenge || challenge.kind !== kind || challenge.origin !== origin || challenge.expiresAt <= this.now()) {
      throw new AuthError(400, 'invalid_challenge');
    }
    return challenge;
  }

  async enrollOptions(bootstrapToken: unknown, origin: string) {
    this.bootstrap(bootstrapToken);
    const userId = randomBytes(32);
    const options = await generateRegistrationOptions({
      rpName: 'Agent Village', rpID: 'localhost', userName: 'Village owner', userID: userId,
      attestationType: 'none', timeout: CHALLENGE_TTL_MS,
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
    });
    return { challengeId: this.addChallenge({ kind: 'enroll', challenge: options.challenge, origin,
      userId: userId.toString('base64url') }), options };
  }

  async enrollVerify(input: { bootstrapToken?: unknown; challengeId?: unknown; response?: unknown }, origin: string) {
    this.bootstrap(input.bootstrapToken);
    const challenge = this.takeChallenge(input.challengeId, 'enroll', origin);
    if (this.#enrolling) throw new AuthError(409, 'already_enrolled');
    this.#enrolling = true;
    try {
      const result = await verifyRegistrationResponse({ response: input.response as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: 'localhost', requireUserVerification: true });
      if (!result.verified || !result.registrationInfo) throw new AuthError(401, 'verification_failed');
      this.bootstrap(input.bootstrapToken); // Recheck after asynchronous verification.
      const credential = result.registrationInfo.credential;
      const owner: Owner = { version: 1, rpID: 'localhost', userId: challenge.userId!,
        credential: { id: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter, transports: credential.transports } };
      writePrivateFile(join(this.directory, 'owner.json'), JSON.stringify(ownerSchema.parse(owner)), true);
      unlinkSync(join(this.directory, 'bootstrap.txt'));
      this.#challenges.clear();
      return this.session();
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new AuthError(409, 'already_enrolled');
      throw new AuthError(401, 'verification_failed');
    } finally { this.#enrolling = false; }
  }

  async loginOptions(origin: string) {
    const owner = this.owner();
    if (!owner) throw new AuthError(409, 'owner_not_enrolled');
    const options = await generateAuthenticationOptions({ rpID: 'localhost', userVerification: 'required', timeout: CHALLENGE_TTL_MS,
      allowCredentials: [{ id: owner.credential.id, transports: owner.credential.transports }] });
    return { challengeId: this.addChallenge({ kind: 'login', challenge: options.challenge, origin }), options };
  }

  async loginVerify(input: { challengeId?: unknown; response?: unknown }, origin: string) {
    const challenge = this.takeChallenge(input.challengeId, 'login', origin);
    const owner = this.owner();
    if (!owner) throw new AuthError(409, 'owner_not_enrolled');
    const response = input.response as AuthenticationResponseJSON | undefined;
    if (!response || response.id !== owner.credential.id) throw new AuthError(401, 'verification_failed');
    if (this.#authenticating) throw new AuthError(429, 'rate_limited');
    this.#authenticating = true;
    try {
      const credential: WebAuthnCredential = { ...owner.credential, publicKey: new Uint8Array(Buffer.from(owner.credential.publicKey, 'base64url')) };
      const result = await verifyAuthenticationResponse({ response, credential, expectedChallenge: challenge.challenge,
        expectedOrigin: origin, expectedRPID: 'localhost', requireUserVerification: true });
      if (!result.verified) throw new AuthError(401, 'verification_failed');
      owner.credential.counter = result.authenticationInfo.newCounter;
      writePrivateFile(join(this.directory, 'owner.json'), JSON.stringify(owner));
      return this.session();
    } catch { throw new AuthError(401, 'verification_failed'); }
    finally { this.#authenticating = false; }
  }

  private session() {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + SESSION_MINUTES * 60_000;
    this.#sessions.clear(); // One active owner session; every authentication rotates it.
    this.#sessions.set(digest(token).toString('hex'), expiresAt);
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  authorize(header: string | undefined): void {
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '')?.[1];
    const key = token ? digest(token).toString('hex') : '';
    const expiresAt = this.#sessions.get(key);
    if (expiresAt === undefined) throw new AuthError(401, 'unauthorized');
    if (expiresAt <= this.now()) { this.#sessions.delete(key); throw new AuthError(401, 'session_expired'); }
    if (!this.owner()) throw new AuthError(503, 'auth_unavailable'); // Configuration drift fails closed.
  }

  authorizeHook(header: string | undefined): void {
    const expected = this.ingestionToken();
    if (!expected || !sameSecret(header?.replace(/^Bearer /, ''), expected) || !header?.startsWith('Bearer ')) {
      throw new AuthError(401, 'unauthorized');
    }
  }

  logout(header: string | undefined): { ok: true } { this.authorize(header); this.#sessions.clear(); return { ok: true }; }
}

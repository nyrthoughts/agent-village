import { z } from 'zod';

/**
 * Normalized observation events. The server assigns `seq` and `receivedAt`; sources supply a
 * stable idempotence `key`. Every field is bounded and allowlisted: no prompt, reasoning,
 * tool payload or raw hook extra can be represented here.
 */
export const EVENT_SOURCES = [
  'claude-hook', 'openclaw-hook', 'codex-journal', 'codex-index', 'claude-journal', 'claude-process',
  'github', 'owner', 'yaml', 'amc', 'fixture',
] as const;
export const PROVENANCES = ['declared', 'observed', 'verified'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];
export type Provenance = (typeof PROVENANCES)[number];

const iso = z.string().datetime({ offset: true }).max(40);
const id = z.string().regex(/^[A-Za-z0-9._:@/+-]{1,160}$/);
const projectIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const label = (max: number) => z.string().max(max);
const repo = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/);
const sha = z.string().regex(/^[a-f0-9]{7,64}$/);
const SENSITIVE_QUERY = /^(?:access_?token|token|auth|authorization|key|api_?key|secret|client_secret|password|passwd|pwd|sig|signature|code|session|jwt|x-amz-[a-z-]+|x-goog-[a-z-]+)$/i;
/**
 * A link is storable only when it is https and carries no credential: no user information
 * and no token, key, signature or authorization query parameter.
 */
export function isSafeSourceUrl(value: string): boolean {
  if (value.length > 400 || !value.startsWith('https://')) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  for (const name of url.searchParams.keys()) if (SENSITIVE_QUERY.test(name)) return false;
  return !/[?&#](?:access_?token|token|api_?key|sig|signature)=/i.test(url.hash);
}
/** Only https links returned by a source API are stored; none is constructed locally. */
const sourceUrl = z.string().max(400).url().refine(isSafeSourceUrl);
const tool = z.enum(['codex', 'claude', 'openclaw', 'other']);
const role = z.enum(['lead', 'helper', 'unknown']);
const state = z.enum(['working', 'waiting', 'idle', 'unknown']);
const level = z.enum(['detected', 'recent', 'confirmed']);

const sessionObserved = z.object({
  tool, role, state, level,
  title: label(120),
  projectName: label(160),
  parentId: id.optional(),
  /** Native working directory, used only to compose a copy-only resume command. */
  cwd: label(1024).optional(),
  terminal: label(120).optional(),
  branch: label(200).optional(),
  repo: repo.optional(),
}).strict();
const sessionSignal = z.object({
  tool, role, state,
  hookEvent: label(40),
  title: label(120).optional(),
  /** Display hint only (directory basename, redacted). Never used for project matching. */
  hint: label(80).optional(),
  parentId: id.optional(),
}).strict();
const sessionUpdate = z.object({ tool, kind: z.enum(['request', 'report']), text: label(2400), title: label(120) }).strict();
const identityMapped = z.object({ sessionId: id, projectId: projectIdSchema, projectName: label(160) }).strict();
const planSaved = z.object({ revision: z.number().int().positive(), validated: z.number().int().min(0).max(12), total: z.number().int().min(0).max(12) }).strict();
const commit = z.object({ repo, branch: label(200), sha, message: label(160), url: sourceUrl.optional() }).strict();
/**
 * `success` only when every check was read and none failed, ran or ended inconclusively;
 * `unknown` covers partial pages and unrecognized conclusions; `neutral` means only
 * skipped/neutral checks. Neither `unknown` nor `neutral` proves a green CI.
 */
const ci = z.object({ repo, sha, status: z.enum(['pending', 'success', 'failure', 'neutral', 'unknown']), name: label(120), url: sourceUrl.optional() }).strict();
const pr = z.object({ repo, number: z.number().int().positive(), state: z.enum(['open', 'merged', 'closed']), title: label(160),
  headSha: sha, headBranch: label(200), mergeSha: sha.optional(), url: sourceUrl.optional() }).strict();
const deploy = z.object({ repo, id: z.number().int().positive(), environment: label(80),
  state: z.enum(['pending', 'success', 'failure', 'inactive']), sha, url: sourceUrl.optional() }).strict();
const yamlTask = z.object({
  title: label(180), declaredStatus: z.enum(['planned', 'in_progress', 'awaiting_review', 'blocked', 'verified']).optional(),
  effectiveStatus: z.enum(['planned', 'in_progress', 'awaiting_review', 'blocked', 'verified']),
  nextAction: label(400).optional(), blockedReason: label(400).optional(), owner: label(80).optional(),
  verifiedCommit: z.boolean(), verifiedReview: z.boolean(), warnings: z.array(z.enum(['unproven_claim', 'invalid_evidence'])).max(2),
  /** SHA named by the verified commit evidence, when the YAML gives one. */
  verifiedSha: sha.optional(),
}).strict();

const base = {
  key: z.string().min(1).max(240),
  source: z.enum(EVENT_SOURCES),
  projectId: projectIdSchema.optional(),
  sessionId: id.optional(),
  occurredAt: iso,
  provenance: z.enum(PROVENANCES),
};

export const eventInputSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('session.observed'), sessionId: id, projectId: projectIdSchema, data: sessionObserved }).strict(),
  z.object({ ...base, kind: z.literal('session.signal'), sessionId: id, data: sessionSignal }).strict(),
  z.object({ ...base, kind: z.literal('session.update'), sessionId: id, data: sessionUpdate }).strict(),
  z.object({ ...base, kind: z.literal('identity.mapped'), data: identityMapped }).strict(),
  z.object({ ...base, kind: z.literal('plan.saved'), projectId: projectIdSchema, data: planSaved }).strict(),
  z.object({ ...base, kind: z.literal('github.commit'), data: commit }).strict(),
  z.object({ ...base, kind: z.literal('github.ci'), data: ci }).strict(),
  z.object({ ...base, kind: z.literal('github.pr'), data: pr }).strict(),
  z.object({ ...base, kind: z.literal('github.deploy'), data: deploy }).strict(),
  z.object({ ...base, kind: z.literal('yaml.task'), projectId: projectIdSchema, data: yamlTask.extend({ taskId: id, projectName: label(160), objective: label(700) }).strict() }).strict(),
]);

const assigned = z.object({ seq: z.number().int().positive(), receivedAt: iso });

export type EventInput = z.infer<typeof eventInputSchema>;
export type VillageEvent = EventInput & { seq: number; receivedAt: string };

/** Validates a stored or streamed event: server fields plus the strict input schema. */
export function parseVillageEvent(value: unknown): VillageEvent | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { seq, receivedAt, ...input } = value as Record<string, unknown>;
  const server = assigned.safeParse({ seq, receivedAt });
  const parsed = eventInputSchema.safeParse(input);
  return server.success && parsed.success ? { ...parsed.data, ...server.data } as VillageEvent : undefined;
}
export type EventKind = EventInput['kind'];
export type EventOf<K extends EventKind> = Extract<VillageEvent, { kind: K }>;

/** Significant events appear in the since-last-visit digest; the rest are folded as noise. */
export function isSignificant(event: Pick<VillageEvent, 'kind'> & { data?: unknown }): boolean {
  if (event.kind === 'session.update') return (event.data as { kind?: string }).kind === 'report';
  return event.kind !== 'session.observed' && event.kind !== 'session.signal';
}

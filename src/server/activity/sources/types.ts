import { isAbsolute } from 'node:path';
import type { ObservedSession, SourceId } from '../../../shared/observation.js';
import { expandHome, type SessionFacts } from '../projectResolver.js';
import type { JournalCache } from './journal.js';

/**
 * A local session source (Codex, Claude Code, Gemini CLI...). Each adapter lists the roots it
 * reads and returns sessions with the facts the project resolver needs. Adapters never decide
 * the project themselves; the resolver does, after all sources are read.
 */
export interface SourceContext {
  home: string;
  env: Readonly<Record<string, string | undefined>>;
  /** Extra roots declared by the owner in `projects.yaml` (`sources:`), already expanded. */
  manifestRoots: Partial<Record<SourceId, string[]>>;
  journals: JournalCache;
  now: number;
}

export interface SourceRoot {
  path: string;
  /** Where this root came from, for the doctor. */
  from: 'default' | 'env' | 'manifest';
  /** Environment variable that set it, when `from` is `env`. */
  variable?: string;
}

/** A session without project fields; the orchestrator resolves and adds them. */
export type CollectedSession = Omit<ObservedSession, 'projectKey' | 'project' | 'attachedTaskId' | 'matchedBy' | 'matchDetail' | 'matchVia'>;

export interface CollectedLead {
  session: CollectedSession;
  facts: SessionFacts;
  /** Gemini: sha256 of the working directory, resolved against known folders by the orchestrator. */
  projectHash?: string;
}

export interface SourceCollection {
  leads: CollectedLead[];
  /** Helpers carry `parentId` and inherit their lead's project. */
  helpers: CollectedSession[];
  errors: string[];
  coverage: string[];
  /** Roots that exist on disk. */
  rootsFound: number;
  rootsChecked: number;
}

export interface SessionSource {
  id: SourceId;
  label: string;
  /** Experimental: the on-disk format is assumed from public behaviour, not verified on a live install. */
  experimental: boolean;
  roots(context: Pick<SourceContext, 'home' | 'env' | 'manifestRoots'>): SourceRoot[];
  collect(context: SourceContext): Promise<SourceCollection>;
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const RECENT_MS = 120_000;
export const DEFAULT_SESSION_LIMIT = 120;

/** Lead sessions read per source. `VILLAGE_SESSION_LIMIT` overrides it, clamped to 10–500. */
export function sessionLimit(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const value = Number.parseInt(env.VILLAGE_SESSION_LIMIT ?? '', 10);
  return Number.isFinite(value) ? Math.min(500, Math.max(10, value)) : DEFAULT_SESSION_LIMIT;
}

export const SESSION_LIMIT = sessionLimit();

export function recent(at: string, now = Date.now()): boolean {
  const age = now - Date.parse(at);
  return Number.isFinite(age) && age >= 0 && age <= RECENT_MS;
}

/**
 * Default root (or its environment override), then comma-separated extra roots from an
 * environment variable, then the manifest list. Relative entries are ignored; duplicates removed.
 */
export function buildRoots(context: Pick<SourceContext, 'home' | 'env' | 'manifestRoots'>, id: SourceId,
  base: { variable?: string; fallback: string }, extraVariable: string): SourceRoot[] {
  const roots: SourceRoot[] = [];
  const add = (value: string | undefined, from: SourceRoot['from'], variable?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const path = expandHome(trimmed, context.home);
    if (!isAbsolute(path) || roots.some((root) => root.path === path)) return;
    roots.push({ path, from, ...(variable ? { variable } : {}) });
  };
  const override = base.variable ? context.env[base.variable] : undefined;
  if (override?.trim()) add(override, 'env', base.variable);
  else add(base.fallback, 'default');
  for (const entry of (context.env[extraVariable] ?? '').split(',')) add(entry, 'env', extraVariable);
  for (const entry of context.manifestRoots[id] ?? []) add(entry, 'manifest');
  return roots;
}

import type { Worker } from './activity.js';

export interface ObservedUpdate {
  at: string;
  kind: 'request' | 'report';
  text: string;
}
/** Why a session belongs to its project, in resolution priority order. */
export const MATCHED_BY = ['rule', 'remote', 'git-root', 'folder', 'unassigned'] as const;
export type MatchedBy = typeof MATCHED_BY[number];
/** Refines `matchedBy`: which rule field matched, or which fallback applied. */
export type MatchVia = 'session' | 'path' | 'remote' | 'title' | 'recorded' | 'claude-worktree' | 'catch-all' | 'no-cwd' | 'unknown-hash';
export type SourceId = 'codex' | 'claude' | 'gemini';
/** supported: tested reader; experimental: format assumed from public behaviour; unavailable: no root found. */
export type SourceStatus = 'supported' | 'experimental' | 'unavailable';
/** What a local source reader found in this snapshot. Paths are never exported. */
export interface ObservedSource { id: SourceId; label: string; status: SourceStatus; experimental: boolean; rootsFound: number; rootsChecked: number; sessions: number }
export type OwnerLinkSource = 'claude-app' | 'chatgpt' | 'other';
/** A chat the app cannot read, entered by the owner in projects.yaml. Never fetched. */
export interface OwnerLink { title: string; url: string; source: OwnerLinkSource }
export interface ObservedSession extends Worker {
  projectKey: string;
  matchedBy?: MatchedBy;
  matchDetail?: string;
  matchVia?: MatchVia;
  objective?: string;
  summary?: string;
  history: ObservedUpdate[];
  terminal?: string;
  sourceNote?: string;
}
export interface ProjectObservation {
  buildingFamilyIndex?: number;
  sessions: ObservedSession[];
  /** Empty when the project has only owner-entered links and no observed session or plan. */
  lastActivityAt: string;
  /** Distinct provenance of the project's sessions, highest priority first. */
  matchedBy: MatchedBy[];
  links: OwnerLink[];
  /** The inbox of sessions that no rule, repository or folder could place. */
  unassigned?: boolean;
}

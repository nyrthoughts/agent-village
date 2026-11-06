import type { BoardSnapshot } from './board.js';
import type { Provenance } from './events.js';
import { declaredSections } from './projectBrief.js';
import { sessionProject, type FactEntity, type SessionEntity, type TaskEntity, type UpdateEntity } from './projector.js';

/**
 * Pure read model of the operations board. Everything shown is a sourced, dated fact or an
 * explicit owner validation. No percentage, estimate or inferred completion is produced.
 */
export type SourceRef =
  | { kind: 'session'; sessionId: string; tool: string; title: string; at: string }
  | { kind: 'fact'; label: string; at: string; url?: string }
  | { kind: 'plan'; at: string }
  | { kind: 'yaml'; at: string; taskId: string };
export interface Quote { text: string; at: string; provenance: Provenance; ref: SourceRef }

export const ATTENTION_ORDER = ['contradiction', 'decision', 'reply', 'validation'] as const;
export type AttentionType = (typeof ATTENTION_ORDER)[number];
export type AttentionReason =
  | 'claim_vs_ci' | 'claim_vs_ci_unpinned' | 'claim_vs_deploy' | 'claim_vs_deploy_unpinned' | 'opposed_sessions' | 'yaml_unproven'
  | 'agent_notification' | 'declared_blocker' | 'yaml_blocked'
  | 'agent_report' | 'agent_stopped'
  | 'declared_done' | 'yaml_review';
export interface AttentionItem {
  id: string;
  type: AttentionType;
  reason: AttentionReason;
  projectId?: string;
  projectName: string;
  since: string;
  quotes: Quote[];
  sessionId?: string;
  seq: number;
}

export type LadderStepName = 'declared' | 'activity' | 'commit' | 'ci' | 'merge' | 'deploy';
export interface LadderStep {
  step: LadderStepName;
  /**
   * absent = not observed (never a failure); not-checked = this mode has no verifier;
   * inconclusive = a fact exists but proves nothing (partial or unrecognized checks).
   */
  state: 'observed' | 'failed' | 'pending' | 'absent' | 'other-sha' | 'not-checked' | 'inconclusive';
  at?: string;
  detail?: string;
  url?: string;
  provenance?: Provenance;
  ref?: SourceRef;
}
export interface ProjectRow {
  id: string;
  name: string;
  objective?: string;
  objectiveSource?: 'plan' | 'yaml';
  status: { kind: 'blocked' | 'waiting' | 'working' | 'quiet'; at?: string; provenance: Provenance };
  next?: Quote;
  blockers: Quote[];
  ladder: LadderStep[];
  /** Owner ledger validations only. */
  milestones?: { validated: number; total: number };
  /** YAML tasks whose evidence the verifier accepted; never counted as owner milestones. */
  yamlProofs?: { verified: number; total: number };
  lastAt?: string;
  lastSeq: number;
  repos: string[];
  branches: string[];
  sessionIds: string[];
  attention: number;
}
export interface TimelineEntry { key: string; seq: number; at: string; kind: 'request' | 'report' | 'commit' | 'ci' | 'pr' | 'deploy' | 'plan' | 'validation' | 'task' | 'mapping'; text: string; provenance: Provenance; ref: SourceRef; sessionId?: string }

export const RECENT_MS = 120_000;
const DAY = 24 * 60 * 60_000;
const time = (value: string | undefined) => value ? Date.parse(value) : Number.NaN;
const byAtDesc = <T extends { at: string }>(a: T, b: T) => time(b.at) - time(a.at);
/** Short single-line excerpt: Markdown headings, bullets and emphasis markers are flattened. */
function short(text: string, max = 220): string {
  const flat = text.split('\n').map((line) => line.trim().replace(/^[-*#>\s]+/, '').replace(/\*\*/g, '')).filter(Boolean).join(' · ');
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n/);
/** The sentence carrying a claim, so the quote shows exactly what was declared. */
function claimSentence(text: string, kind: string, failing: boolean): string {
  return sentences(text).find((line) => (failing ? claims(line).failure : claims(line).success).has(kind))?.replace(/^[-*#>\s]+/, '') ?? text;
}

// Unicode-aware word boundaries: `\b` does not treat accented letters as word characters.
const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';
const SUCCESS = new RegExp(`${B}(tests?|ci|builds?|checks?|deploy(?:ment|ed)?|déploiement|déployé)${E}[^.\\n]{0,60}?${B}(pass(?:ed|es|ing)?|green|succeed(?:ed|s)?|successful|ok|passent|passé|verts?|vertes?|réussi(?:e|s|es)?|fonctionnel(?:le)?s?|live|en ligne)${E}`, 'iu');
const SUCCESS_PHRASE = new RegExp(`${B}(all (?:tests|checks) pass|tous les tests passent|déployé en production|deployed to (?:production|prod))${E}`, 'iu');
const FAILURE = new RegExp(`${B}(tests?|ci|builds?|checks?|deploy(?:ment)?|déploiement)${E}[^.\\n]{0,60}?${B}(fail(?:s|ed|ing|ure)?|red|broken|échou\\p{L}*|rouges?|cass(?:é|ée|és|ées|e)|ko)${E}`, 'iu');
/** Negated wording carries no polarity: "tests are not passing", "no tests failed", "ne passent pas". */
const NEGATION = new RegExp(`${B}(not|never|no|none|cannot|without|ne|pas|plus|jamais|aucun(?:e)?|sans)${E}|n['’]t${E}|${B}n['’]`, 'iu');
const topic = (word: string) => /^(deploy|déploi|déployé)/i.test(word) ? 'deploy' : 'checks';

/** The clause around a match (up to the previous , ; : or dash) plus the match itself. */
function negated(sentence: string, match: RegExpExecArray): boolean {
  const before = sentence.slice(0, match.index);
  const clauseStart = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf(':'), before.lastIndexOf(' - '), before.lastIndexOf('—')) + 1;
  return NEGATION.test(sentence.slice(clauseStart, match.index + match[0].length));
}

/** Polarity of explicit claims in a report, per topic. Mixed and negated statements carry none. */
export function claims(text: string): { success: Set<string>; failure: Set<string> } {
  const success = new Set<string>(); const failure = new Set<string>();
  for (const sentence of sentences(text)) {
    const okMatch = SUCCESS.exec(sentence); const koMatch = FAILURE.exec(sentence);
    const phrase = SUCCESS_PHRASE.exec(sentence);
    const ok = okMatch && !negated(sentence, okMatch) ? okMatch : undefined;
    const ko = koMatch && !negated(sentence, koMatch) ? koMatch : undefined;
    const anyNegation = Boolean((okMatch && !ok) || (koMatch && !ko));
    if (ok && !koMatch) success.add(topic(ok[1]!));
    else if (phrase && !koMatch && !anyNegation && !negated(sentence, phrase)) success.add(/deploy|déploy/i.test(sentence) ? 'deploy' : 'checks');
    if (ko && !okMatch && !anyNegation) failure.add(topic(ko[1]!));
  }
  for (const value of [...success]) if (failure.has(value)) { success.delete(value); failure.delete(value); }
  return { success, failure };
}

/** Commit identifiers cited in a claim (7–40 hex characters with at least one digit). */
export function citedShas(text: string): string[] {
  return [...new Set([...text.matchAll(/(?<![A-Za-z0-9])([0-9a-f]{7,40})(?![A-Za-z0-9])/gi)].map((match) => match[1]!.toLowerCase()).filter((value) => /\d/.test(value)))];
}
const sameSha = (full: string, cited: string) => full.toLowerCase().startsWith(cited) || cited.startsWith(full.toLowerCase());

function sessionRef(session: SessionEntity | undefined, update: UpdateEntity): SourceRef {
  return { kind: 'session', sessionId: update.sessionId, tool: update.tool, title: session?.title ?? update.title, at: update.at };
}
function factLabel(fact: FactEntity): string {
  switch (fact.kind) {
    case 'github.commit': return `${fact.data.repo} · ${fact.data.branch} · ${fact.data.sha.slice(0, 7)}`;
    case 'github.ci': return `${fact.data.repo} · CI ${fact.data.sha.slice(0, 7)}`;
    case 'github.pr': return `${fact.data.repo} #${fact.data.number}`;
    case 'github.deploy': return `${fact.data.repo} · ${fact.data.environment}`;
  }
}
function factRef(fact: FactEntity): SourceRef {
  return { kind: 'fact', label: factLabel(fact), at: fact.occurredAt, ...(fact.data.url ? { url: fact.data.url } : {}) };
}

/**
 * Current presence of a session at `now`. A working or recent state is current only when its
 * signal is at most two minutes old and not in the future; otherwise it is shown as unconfirmed.
 */
export function sessionPresence(session: SessionEntity, now: number): { state: SessionEntity['state']; level?: SessionEntity['level']; current: boolean } {
  const age = now - time(session.stateAt);
  const current = age >= 0 && age <= RECENT_MS;
  return {
    state: session.state === 'working' && !current ? 'unknown' : session.state,
    ...(session.level ? { level: session.level !== 'detected' && !current ? 'detected' as const : session.level } : {}),
    current,
  };
}

interface ProjectIndex {
  id: string;
  name: string;
  sessions: SessionEntity[];
  updates: UpdateEntity[];
  facts: FactEntity[];
  /** Every fact of the project's repositories, attributed or not; used only for exact-SHA claims. */
  repoFacts: FactEntity[];
  tasks: TaskEntity[];
  repos: string[];
  branches: Map<string, Set<string>>;
}

/**
 * GitHub facts are attributed to a project by repository AND observed branch, then by exact
 * SHA: commits of an observed branch; pull requests whose head branch is observed or whose head
 * is one of those commits; CI runs and deployments of one of those SHAs (commit, PR head or
 * merge commit). Another branch's facts, including the default branch's, never prove this work.
 */
function attributeFacts(project: ProjectIndex, facts: FactEntity[]): void {
  const inRepo = facts.filter((fact) => project.repos.includes(fact.data.repo));
  project.repoFacts = inRepo;
  const branchOf = (repo: string) => project.branches.get(repo) ?? new Set<string>();
  const shas = new Set<string>();
  const key = (repo: string, sha: string) => `${repo}@${sha}`;
  const commits = inRepo.filter((fact) => fact.kind === 'github.commit' && branchOf(fact.data.repo).has(fact.data.branch));
  for (const fact of commits) shas.add(key(fact.data.repo, (fact as Extract<FactEntity, { kind: 'github.commit' }>).data.sha));
  const pulls = inRepo.filter((fact): fact is Extract<FactEntity, { kind: 'github.pr' }> => fact.kind === 'github.pr'
    && (branchOf(fact.data.repo).has(fact.data.headBranch) || shas.has(key(fact.data.repo, fact.data.headSha))));
  for (const pull of pulls) { shas.add(key(pull.data.repo, pull.data.headSha)); if (pull.data.mergeSha) shas.add(key(pull.data.repo, pull.data.mergeSha)); }
  const bySha = inRepo.filter((fact) => (fact.kind === 'github.ci' || fact.kind === 'github.deploy') && shas.has(key(fact.data.repo, fact.data.sha)));
  project.facts = [...commits, ...pulls, ...bySha];
}

/** Groups entities by project. Sessions without a trusted project are returned as unmatched. */
export function indexProjects(snapshot: BoardSnapshot): { projects: Map<string, ProjectIndex>; unmatched: SessionEntity[] } {
  const { state, plans } = snapshot;
  const projects = new Map<string, ProjectIndex>();
  const ensure = (id: string, name?: string) => {
    let entry = projects.get(id);
    if (!entry) { entry = { id, name: name ?? id, sessions: [], updates: [], facts: [], repoFacts: [], tasks: [], repos: [], branches: new Map() }; projects.set(id, entry); }
    else if (name && entry.name === id) entry.name = name;
    return entry;
  };
  for (const project of Object.values(state.projects)) {
    const entry = ensure(project.id, project.name);
    if (project.repo && !entry.repos.includes(project.repo)) entry.repos.push(project.repo);
  }
  for (const [id, plan] of Object.entries(plans)) ensure(id, plan.projectName);
  const unmatched: SessionEntity[] = [];
  const sessionOwner = new Map<string, string>();
  for (const session of Object.values(state.sessions)) {
    const projectId = sessionProject(state, session.id);
    if (!projectId) { if (session.role !== 'helper' || !session.parentId) unmatched.push(session); continue; }
    sessionOwner.set(session.id, projectId);
    const entry = ensure(projectId, state.mappings[session.id]?.projectName ?? session.projectName);
    entry.sessions.push(session);
    if (session.repo && !entry.repos.includes(session.repo)) entry.repos.push(session.repo);
    if (session.repo && session.branch) entry.branches.set(session.repo, (entry.branches.get(session.repo) ?? new Set()).add(session.branch));
  }
  for (const update of Object.values(state.updates)) {
    const projectId = sessionOwner.get(update.sessionId) ?? sessionProject(state, update.sessionId);
    if (projectId) ensure(projectId).updates.push(update);
  }
  const facts = Object.values(state.facts);
  for (const entry of projects.values()) if (entry.repos.length) attributeFacts(entry, facts);
  for (const task of Object.values(state.tasks)) ensure(task.projectId, task.projectName).tasks.push(task);
  return { projects, unmatched: unmatched.sort((a, b) => time(b.stateAt) - time(a.stateAt)) };
}

/** Latest update of each session, kept only when it is a report (a newer request answers it). */
function latestReports(project: ProjectIndex): UpdateEntity[] {
  const latest = new Map<string, UpdateEntity>();
  for (const update of [...project.updates].sort(byAtDesc)) {
    if (!latest.has(update.sessionId)) latest.set(update.sessionId, update);
  }
  return [...latest.values()].filter((update) => update.kind === 'report').sort(byAtDesc);
}

function newestFact<K extends FactEntity['kind']>(facts: FactEntity[], kind: K, filter: (fact: Extract<FactEntity, { kind: K }>) => boolean = () => true): Extract<FactEntity, { kind: K }> | undefined {
  return facts.filter((fact): fact is Extract<FactEntity, { kind: K }> => fact.kind === kind && filter(fact as Extract<FactEntity, { kind: K }>))
    .sort((a, b) => time(b.occurredAt) - time(a.occurredAt))[0];
}

/** Head commit of the observed branches, CI for that exact SHA, and the newest CI on another attributed SHA. */
export function ciState(facts: FactEntity[]) {
  const head = newestFact(facts, 'github.commit');
  const latestCi = newestFact(facts, 'github.ci');
  const headCi = head ? newestFact(facts, 'github.ci', (fact) => fact.data.sha === head.data.sha && fact.data.repo === head.data.repo) : latestCi;
  return { head, headCi, otherCi: headCi ? undefined : latestCi };
}

const ciLadderState = (status: string): LadderStep['state'] => status === 'success' ? 'observed' : status === 'failure' ? 'failed' : status === 'pending' ? 'pending' : 'inconclusive';

function ladder(project: ProjectIndex, sessions: Record<string, SessionEntity>, now: number): LadderStep[] {
  const reports = latestReports(project);
  const yaml = project.tasks.length > 0 && project.sessions.length === 0 && project.facts.length === 0;
  const steps: LadderStep[] = [];
  const declared = reports.find((report) => declaredSections(report).done.length > 0);
  if (declared) steps.push({ step: 'declared', state: 'observed', at: declared.at, provenance: 'declared', detail: short(declaredSections(declared).done[0]!.text, 120), ref: sessionRef(sessions[declared.sessionId], declared) });
  else if (project.tasks.some((task) => task.declaredStatus)) {
    const task = project.tasks.find((entry) => entry.declaredStatus === 'verified') ?? project.tasks.find((entry) => entry.declaredStatus)!;
    steps.push({ step: 'declared', state: 'observed', at: task.occurredAt, provenance: 'declared', detail: `${task.title} · ${task.declaredStatus}`, ref: { kind: 'yaml', at: task.occurredAt, taskId: task.taskId } });
  } else steps.push({ step: 'declared', state: 'absent' });
  const active = [...project.sessions].filter((session) => time(session.stateAt) <= now).sort((a, b) => time(b.stateAt) - time(a.stateAt))[0];
  if (active) {
    const presence = sessionPresence(active, now);
    steps.push({ step: 'activity', state: 'observed', at: active.stateAt, provenance: 'observed', detail: `${active.tool} · ${presence.state}${presence.level ? ` · ${presence.level}` : ''}`,
      ref: { kind: 'session', sessionId: active.id, tool: active.tool, title: active.title, at: active.stateAt } });
  } else steps.push({ step: 'activity', state: 'absent' });
  const { head, headCi, otherCi } = ciState(project.facts);
  const commitTask = project.tasks.find((task) => task.verifiedCommit);
  steps.push(head ? { step: 'commit', state: 'observed', at: head.occurredAt, provenance: 'observed', detail: `${head.data.branch} · ${head.data.sha.slice(0, 7)} · ${head.data.message}`, url: head.data.url, ref: factRef(head) }
    : commitTask ? { step: 'commit', state: 'observed', at: commitTask.occurredAt, provenance: 'verified', detail: commitTask.verifiedSha ? `${commitTask.verifiedSha.slice(0, 7)} · ${commitTask.title}` : commitTask.title, ref: { kind: 'yaml', at: commitTask.occurredAt, taskId: commitTask.taskId } }
      : { step: 'commit', state: 'absent' });
  if (yaml) {
    for (const step of ['ci', 'merge', 'deploy'] as const) steps.push({ step, state: 'not-checked' });
    return steps;
  }
  if (headCi) steps.push({ step: 'ci', state: ciLadderState(headCi.data.status), at: headCi.occurredAt, provenance: 'observed',
    detail: `${headCi.data.status} · ${headCi.data.sha.slice(0, 7)} · ${headCi.data.name}`, url: headCi.data.url, ref: factRef(headCi) });
  else if (otherCi) steps.push({ step: 'ci', state: 'other-sha', at: otherCi.occurredAt, provenance: 'observed', detail: `${otherCi.data.status} · ${otherCi.data.sha.slice(0, 7)}`, url: otherCi.data.url, ref: factRef(otherCi) });
  else steps.push({ step: 'ci', state: 'absent' });
  const merged = newestFact(project.facts, 'github.pr', (fact) => fact.data.state === 'merged');
  const open = newestFact(project.facts, 'github.pr', (fact) => fact.data.state === 'open');
  steps.push(merged ? { step: 'merge', state: 'observed', at: merged.occurredAt, provenance: 'observed', detail: `#${merged.data.number} · ${merged.data.title}`, url: merged.data.url, ref: factRef(merged) }
    : open ? { step: 'merge', state: 'pending', at: open.occurredAt, provenance: 'observed', detail: `#${open.data.number} · ${open.data.title}`, url: open.data.url, ref: factRef(open) }
      : { step: 'merge', state: 'absent' });
  const deploy = newestFact(project.facts, 'github.deploy', (fact) => fact.data.state !== 'inactive');
  steps.push(deploy ? { step: 'deploy', state: deploy.data.state === 'success' ? 'observed' : deploy.data.state === 'failure' ? 'failed' : 'pending', at: deploy.occurredAt, provenance: 'observed',
    detail: `${deploy.data.environment} · ${deploy.data.state} · ${deploy.data.sha.slice(0, 7)}`, url: deploy.data.url, ref: factRef(deploy) } : { step: 'deploy', state: 'absent' });
  return steps;
}

function quote(update: UpdateEntity, sessions: Record<string, SessionEntity>, text = update.text, provenance: Provenance = 'declared'): Quote {
  return { text: short(text), at: update.at, provenance, ref: sessionRef(sessions[update.sessionId], update) };
}
const sessionQuote = (session: SessionEntity): Quote => ({ text: session.title, at: session.stateAt, provenance: 'observed',
  ref: { kind: 'session', sessionId: session.id, tool: session.tool, title: session.title, at: session.stateAt } });

/**
 * Success claims against contrary observed facts. A claim that cites a SHA is compared with
 * that exact commit only (a proved contradiction). A claim without a SHA against a failure on
 * the observed head is shown as uncertain (`*_unpinned`), never as an exact-SHA contradiction.
 */
function claimContradictions(project: ProjectIndex, reports: UpdateEntity[], sessions: Record<string, SessionEntity>): AttentionItem[] {
  const items: AttentionItem[] = [];
  const base = { projectId: project.id, projectName: project.name };
  const { head, headCi } = ciState(project.facts);
  const headDeploy = newestFact(project.facts, 'github.deploy', (fact) => fact.data.state !== 'inactive');
  for (const kind of ['checks', 'deploy'] as const) {
    const claim = reports.find((report) => claims(report.text).success.has(kind));
    if (!claim) continue;
    const sentence = claimSentence(claim.text, kind, false);
    const cited = citedShas(sentence);
    // Exact: the newest CI result (or deployment) of a cited commit failed.
    const exact = cited.flatMap((sha) => {
      const latest = kind === 'checks'
        ? newestFact(project.repoFacts, 'github.ci', (fact) => sameSha(fact.data.sha, sha))
        : newestFact(project.repoFacts, 'github.deploy', (fact) => fact.data.state !== 'inactive' && sameSha(fact.data.sha, sha));
      const failed = latest?.kind === 'github.ci' ? latest.data.status === 'failure' : latest?.kind === 'github.deploy' ? latest.data.state === 'failure' : false;
      return latest && failed ? [latest] : [];
    }).sort((a, b) => time(b.occurredAt) - time(a.occurredAt))[0];
    const contrary: FactEntity | undefined = cited.length ? exact
      : kind === 'checks' ? (headCi?.data.status === 'failure' ? headCi : undefined) : (headDeploy?.data.state === 'failure' ? headDeploy : undefined);
    if (!contrary) continue;
    const reason = kind === 'checks' ? (cited.length ? 'claim_vs_ci' : 'claim_vs_ci_unpinned') : (cited.length ? 'claim_vs_deploy' : 'claim_vs_deploy_unpinned');
    const observed = contrary.kind === 'github.ci'
      ? `CI ${contrary.data.status} · ${contrary.data.name} · ${contrary.data.sha.slice(0, 7)}${head && head.data.sha === contrary.data.sha ? ` · ${head.data.branch}` : ''}`
      : `${(contrary as Extract<FactEntity, { kind: 'github.deploy' }>).data.environment} · ${(contrary as Extract<FactEntity, { kind: 'github.deploy' }>).data.state} · ${contrary.data.sha.slice(0, 7)}`;
    items.push({ ...base, id: `contradiction:${reason}:${project.id}:${contrary.seq}:${claim.seq}`, type: 'contradiction', reason,
      since: new Date(Math.max(time(contrary.occurredAt), time(claim.at))).toISOString(), sessionId: claim.sessionId, seq: Math.max(contrary.seq, claim.seq),
      quotes: [quote(claim, sessions, sentence), { text: observed, at: contrary.occurredAt, provenance: 'observed', ref: factRef(contrary) }] });
  }
  return items;
}

/**
 * Attention never expires on a hidden timer: an item stays until a newer source fact (a newer
 * state or report of the same session, a new plan revision) or an owner action (seen, snooze,
 * validation) resolves it.
 */
function attentionFor(project: ProjectIndex, snapshot: BoardSnapshot, now: number): AttentionItem[] {
  const { sessions } = snapshot.state;
  const items: AttentionItem[] = [];
  const base = { projectId: project.id, projectName: project.name };
  const reports = latestReports(project);
  items.push(...claimContradictions(project, reports, sessions));
  // Contradiction: two sessions of the project declare opposite outcomes on the same topic.
  for (const kind of ['checks', 'deploy']) {
    const yes = reports.find((report) => claims(report.text).success.has(kind));
    const no = reports.find((report) => report.sessionId !== yes?.sessionId && claims(report.text).failure.has(kind));
    if (yes && no) {
      items.push({ ...base, id: `contradiction:opposed_sessions:${project.id}:${kind}:${yes.seq}:${no.seq}`, type: 'contradiction', reason: 'opposed_sessions',
        since: [yes.at, no.at].sort()[1]!, seq: Math.max(yes.seq, no.seq), sessionId: no.sessionId,
        quotes: [quote(yes, sessions, claimSentence(yes.text, kind, false)), quote(no, sessions, claimSentence(no.text, kind, true))] });
    }
  }
  for (const task of project.tasks.filter((entry) => entry.warnings.includes('unproven_claim'))) {
    items.push({ ...base, id: `contradiction:yaml_unproven:${project.id}:${task.taskId}:${task.seq}`, type: 'contradiction', reason: 'yaml_unproven', since: task.occurredAt, seq: task.seq,
      quotes: [{ text: `${task.title} · ${task.declaredStatus ?? 'verified'}`, at: task.occurredAt, provenance: 'declared', ref: { kind: 'yaml', at: task.occurredAt, taskId: task.taskId } }] });
  }
  // Decisions: an agent notification (permission or input), or a declared blocker.
  const decided = new Set<string>();
  const latestOf = (sessionId: string) => project.updates.filter((update) => update.sessionId === sessionId).sort(byAtDesc)[0];
  for (const session of project.sessions) {
    if (session.state !== 'waiting' || session.hookEvent !== 'Notification') continue;
    const latest = latestOf(session.id);
    if (latest && time(latest.at) > time(session.stateAt)) continue; // The conversation moved on.
    decided.add(session.id);
    items.push({ ...base, id: `decision:agent_notification:${session.id}:${session.seq}`, type: 'decision', reason: 'agent_notification', since: session.stateAt, sessionId: session.id, seq: session.seq,
      quotes: latest ? [quote(latest, sessions)] : [sessionQuote(session)] });
  }
  for (const report of reports) {
    const blocked = declaredSections(report).blocked;
    if (!blocked.length || decided.has(report.sessionId)) continue;
    decided.add(report.sessionId);
    items.push({ ...base, id: `decision:declared_blocker:${report.sessionId}:${report.seq}`, type: 'decision', reason: 'declared_blocker', since: report.at, sessionId: report.sessionId, seq: report.seq,
      quotes: [quote(report, sessions, blocked[0]!.text)] });
  }
  for (const task of project.tasks.filter((entry) => entry.effectiveStatus === 'blocked')) {
    items.push({ ...base, id: `decision:yaml_blocked:${project.id}:${task.taskId}:${task.seq}`, type: 'decision', reason: 'yaml_blocked', since: task.occurredAt, seq: task.seq,
      quotes: [{ text: task.blockedReason ? `${task.title} · ${task.blockedReason}` : task.title, at: task.occurredAt, provenance: 'declared', ref: { kind: 'yaml', at: task.occurredAt, taskId: task.taskId } }] });
  }
  // Reports to read: the confirmed lead conversation spoke last and is not working right now.
  for (const session of project.sessions.filter((entry) => entry.role === 'lead' && !decided.has(entry.id))) {
    const latest = latestOf(session.id);
    if (session.state === 'working' && sessionPresence(session, now).current) continue;
    if (latest?.kind === 'report' && !declaredSections(latest).done.length) {
      items.push({ ...base, id: `reply:agent_report:${session.id}:${latest.seq}`, type: 'reply', reason: 'agent_report', since: latest.at, sessionId: session.id, seq: latest.seq, quotes: [quote(latest, sessions)] });
    } else if (!latest && session.state === 'waiting' && session.hookEvent === 'Stop') {
      items.push({ ...base, id: `reply:agent_stopped:${session.id}:${session.seq}`, type: 'reply', reason: 'agent_stopped', since: session.stateAt, sessionId: session.id, seq: session.seq, quotes: [sessionQuote(session)] });
    }
  }
  // Validation: declared completion newer than the ledger, without a ledger plan or with unvalidated milestones.
  const plan = snapshot.plans[project.id];
  if (!plan || plan.milestones.some((milestone) => !milestone.validated)) {
    const done = reports.find((report) => declaredSections(report).done.length > 0 && (!plan || time(report.at) > time(plan.updatedAt)));
    if (done) items.push({ ...base, id: `validation:declared_done:${project.id}:${done.seq}`, type: 'validation', reason: 'declared_done', since: done.at, sessionId: done.sessionId, seq: done.seq,
      quotes: declaredSections(done).done.slice(0, 2).map((entry) => quote(done, sessions, entry.text)) });
  }
  for (const task of project.tasks.filter((entry) => entry.effectiveStatus === 'awaiting_review')) {
    items.push({ ...base, id: `validation:yaml_review:${project.id}:${task.taskId}:${task.seq}`, type: 'validation', reason: 'yaml_review', since: task.occurredAt, seq: task.seq,
      quotes: [{ text: task.title, at: task.occurredAt, provenance: 'declared', ref: { kind: 'yaml', at: task.occurredAt, taskId: task.taskId } }] });
  }
  return items;
}

/** Type first, then oldest waiting first. */
export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => ATTENTION_ORDER.indexOf(a.type) - ATTENTION_ORDER.indexOf(b.type) || time(a.since) - time(b.since) || a.id.localeCompare(b.id));
}

function status(project: ProjectIndex, now: number): ProjectRow['status'] {
  // Any session whose latest report declares a blocker keeps the project blocked: another
  // session's newer report does not resolve it.
  const blockedReport = latestReports(project).find((report) => declaredSections(report).blocked.length > 0);
  if (blockedReport) return { kind: 'blocked', at: blockedReport.at, provenance: 'declared' };
  const blockedTask = project.tasks.find((task) => task.effectiveStatus === 'blocked');
  if (blockedTask) return { kind: 'blocked', at: blockedTask.occurredAt, provenance: 'declared' };
  const waiting = project.sessions.filter((session) => session.state === 'waiting' && time(session.stateAt) <= now
    && (session.hookEvent === 'Notification' || now - time(session.stateAt) <= DAY)).sort((a, b) => time(b.stateAt) - time(a.stateAt))[0];
  if (waiting) return { kind: 'waiting', at: waiting.stateAt, provenance: 'observed' };
  // Current work needs a recent, non-future, non-`detected` working signal.
  const working = project.sessions.find((session) => session.state === 'working' && session.level !== 'detected' && sessionPresence(session, now).current);
  if (working) return { kind: 'working', at: working.stateAt, provenance: 'observed' };
  return { kind: 'quiet', at: lastActivity(project, now), provenance: 'observed' };
}

function lastActivity(project: ProjectIndex, now = Number.POSITIVE_INFINITY): string | undefined {
  const times = [...project.sessions.map((session) => session.stateAt), ...project.updates.map((update) => update.at), ...project.facts.map((fact) => fact.occurredAt), ...project.tasks.map((task) => task.occurredAt)];
  return times.filter((value) => time(value) <= now).sort((a, b) => time(b) - time(a))[0];
}

export interface BoardView { rows: ProjectRow[]; attention: AttentionItem[]; unmatched: SessionEntity[] }

export function buildBoardView(snapshot: BoardSnapshot, now: number): BoardView {
  const { projects, unmatched } = indexProjects(snapshot);
  const attention: AttentionItem[] = [];
  const rows: ProjectRow[] = [];
  for (const project of projects.values()) {
    const items = attentionFor(project, snapshot, now);
    attention.push(...items);
    const plan = snapshot.plans[project.id];
    const reports = latestReports(project);
    const nextReport = reports.find((report) => declaredSections(report).next.length > 0);
    const nextTask = project.tasks.find((task) => task.nextAction);
    const lastSeq = Math.max(0, ...project.sessions.map((s) => s.seq), ...project.updates.map((u) => u.seq), ...project.facts.map((f) => f.seq), ...project.tasks.map((t) => t.seq),
      snapshot.state.plans[project.id]?.seq ?? 0);
    rows.push({
      id: project.id, name: project.name,
      ...(plan ? { objective: plan.objective, objectiveSource: 'plan' as const } : project.tasks[0] ? { objective: project.tasks[0].objective, objectiveSource: 'yaml' as const } : {}),
      status: status(project, now),
      ...(nextReport ? { next: quote(nextReport, snapshot.state.sessions, declaredSections(nextReport).next[0]!.text) }
        : nextTask ? { next: { text: short(nextTask.nextAction!), at: nextTask.occurredAt, provenance: 'declared' as const, ref: { kind: 'yaml' as const, at: nextTask.occurredAt, taskId: nextTask.taskId } } } : {}),
      blockers: reports.flatMap((report) => declaredSections(report).blocked.slice(0, 1).map((entry) => quote(report, snapshot.state.sessions, entry.text))).slice(0, 2),
      ladder: ladder(project, snapshot.state.sessions, now),
      ...(plan ? { milestones: { validated: plan.milestones.filter((m) => m.validated).length, total: plan.milestones.length } } : {}),
      ...(project.tasks.length ? { yamlProofs: { verified: project.tasks.filter((t) => t.effectiveStatus === 'verified').length, total: project.tasks.length } } : {}),
      lastAt: lastActivity(project, now) ?? plan?.updatedAt, lastSeq, repos: project.repos,
      branches: [...project.branches.values()].flatMap((set) => [...set]).sort(), sessionIds: project.sessions.map((s) => s.id), attention: items.length,
    });
  }
  // Stable order: attention first, then most recent activity, then name.
  rows.sort((a, b) => Number(b.attention > 0) - Number(a.attention > 0) || time(b.lastAt) - time(a.lastAt) || a.name.localeCompare(b.name));
  return { rows, attention: sortAttention(attention), unmatched };
}

export function projectTimeline(snapshot: BoardSnapshot, projectId: string, limit = 120): TimelineEntry[] {
  const { projects } = indexProjects(snapshot);
  const project = projects.get(projectId);
  if (!project) return [];
  const { sessions } = snapshot.state;
  const entries: TimelineEntry[] = project.updates.map((update) => ({ key: update.key, seq: update.seq, at: update.at, kind: update.kind, text: update.text, provenance: 'declared',
    ref: sessionRef(sessions[update.sessionId], update), sessionId: update.sessionId }));
  for (const fact of project.facts) {
    const text = fact.kind === 'github.commit' ? `${fact.data.branch} · ${fact.data.sha.slice(0, 7)} · ${fact.data.message}`
      : fact.kind === 'github.ci' ? `CI ${fact.data.status} · ${fact.data.name} · ${fact.data.sha.slice(0, 7)}`
        : fact.kind === 'github.pr' ? `PR #${fact.data.number} ${fact.data.state} · ${fact.data.title}`
          : `${fact.data.environment} · ${fact.data.state} · ${fact.data.sha.slice(0, 7)}`;
    entries.push({ key: fact.key, seq: fact.seq, at: fact.occurredAt, kind: fact.kind === 'github.commit' ? 'commit' : fact.kind === 'github.ci' ? 'ci' : fact.kind === 'github.pr' ? 'pr' : 'deploy',
      text, provenance: fact.provenance, ref: factRef(fact) });
  }
  const plan = snapshot.plans[projectId];
  for (const milestone of plan?.milestones ?? []) {
    if (milestone.validated && milestone.validatedAt) entries.push({ key: `validation:${milestone.id}`, seq: snapshot.state.plans[projectId]?.seq ?? 0, at: milestone.validatedAt, kind: 'validation',
      text: `${milestone.title} · ${milestone.note}`, provenance: 'verified', ref: { kind: 'plan', at: milestone.validatedAt } });
  }
  for (const task of project.tasks) entries.push({ key: `task:${task.taskId}`, seq: task.seq, at: task.occurredAt, kind: 'task',
    text: `${task.title} · ${task.effectiveStatus}${task.verifiedSha ? ` · ${task.verifiedSha.slice(0, 7)}` : ''}`,
    provenance: task.verifiedCommit || task.verifiedReview ? 'verified' : 'declared', ref: { kind: 'yaml', at: task.occurredAt, taskId: task.taskId } });
  return entries.sort((a, b) => time(b.at) - time(a.at) || b.seq - a.seq).slice(0, limit);
}

/** Last-visit sequence numbers (global and per project) for one journal epoch. No text. */
export interface VisitMarks { epoch: string; global: number | null; projects: Record<string, number> }
export interface DigestGroup { projectId?: string; projectName: string; significant: TimelineEntry[]; folded: number }

/**
 * Changes after the owner's last visit, by sequence number. A project without any recorded
 * visit in this journal epoch shows its last 24 hours. Session state flips and requests are folded.
 */
export function sinceLastVisit(snapshot: BoardSnapshot, visit: VisitMarks | undefined, now: number): { groups: DigestGroup[]; firstVisit: boolean } {
  const marks = visit && visit.epoch === snapshot.epoch ? visit : undefined;
  const firstVisit = !marks || marks.global === null;
  const { projects } = indexProjects(snapshot);
  const groups: DigestGroup[] = [];
  for (const project of projects.values()) {
    const recorded = Math.max(marks?.global ?? -1, marks?.projects[project.id] ?? -1);
    const mark = recorded >= 0 ? recorded : undefined;
    const isNew = (seq: number, at: string) => mark === undefined ? now - time(at) <= DAY : seq > mark;
    const entries = projectTimeline(snapshot, project.id, 500).filter((entry) => isNew(entry.seq, entry.at));
    const significant = entries.filter((entry) => entry.kind !== 'request');
    const sessionNoise = project.sessions.filter((session) => isNew(session.seq, session.stateAt)).length;
    const folded = entries.length - significant.length + sessionNoise;
    if (significant.length || folded) groups.push({ projectId: project.id, projectName: project.name, significant, folded });
  }
  return { groups: groups.sort((a, b) => b.significant.length - a.significant.length || time(b.significant[0]?.at) - time(a.significant[0]?.at) || a.projectName.localeCompare(b.projectName)), firstVisit };
}

const quoteShell = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
/** Copy-only suggestion. Never executed by the board or the server. */
export function resumeCommand(session: SessionEntity | undefined): string | undefined {
  if (!session || session.role === 'helper') return undefined;
  const [tool, id] = [session.id.slice(0, session.id.indexOf(':')), session.id.slice(session.id.indexOf(':') + 1)];
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return undefined;
  const command = tool === 'codex' ? `codex resume ${id}` : tool === 'claude' ? `claude --resume ${id}` : undefined;
  if (!command) return undefined;
  return session.cwd ? `cd ${quoteShell(session.cwd)} && ${command}` : command;
}

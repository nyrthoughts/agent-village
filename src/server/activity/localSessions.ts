import { homedir } from 'node:os';
import { dirname } from 'node:path';
import type { ObservedSession, ObservedSource } from '../../shared/observation.js';
import { ProjectManifestFile } from '../config/projectManifest.js';
import { projectId } from './projectObserver.js';
import { defaultCatchAll, expandHome, gitProbe, ProjectResolver, rulesFromAliases,
  type DeclaredProject, type GitProbe, type ProjectRule, type ResolverConfig, type SessionFacts } from './projectResolver.js';
import { claudeSource } from './sources/claude.js';
import { codexSource } from './sources/codex.js';
import { geminiProjectHash, geminiSource } from './sources/gemini.js';
import { JournalCache } from './sources/journal.js';
import type { CollectedLead, SessionSource, SourceCollection, SourceContext } from './sources/types.js';

interface Options {
  home?: string;
  /** Environment for root overrides (CODEX_HOME, CLAUDE_CONFIG_DIR, VILLAGE_*_DIRS). Defaults to none. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Legacy VILLAGE_PROJECT_ALIASES, migrated into resolver rules after the manifest's own rules. */
  aliases?: Record<string, string>;
  /** Optional owner manifest (`projects.yaml` in the private directory). */
  manifestPath?: string;
  gitProbe?: GitProbe;
  sources?: SessionSource[];
}
interface ProjectMove { from: string; to: string }
interface Snapshot {
  sessions: ObservedSession[];
  errors: string[];
  coverage: string[];
  /** Owner-declared projects from the manifest, with their links. */
  declared: DeclaredProject[];
  /** Pre-resolver keys that now resolve elsewhere, so saved plans can follow. */
  moves: ProjectMove[];
  /** What each local source found, for the header. */
  sources: ObservedSource[];
}
export const DEFAULT_SOURCES: SessionSource[] = [codexSource, claudeSource, geminiSource];
const HELPER_COVERAGE = [
  'Codex : sous-agents issus des liens parent-enfant de 60 conversations sur 7 jours ; 200 métadonnées maximum, profondeur 8, activité non confirmée.',
  'Claude : sous-agents issus des hooks reçus depuis le démarrage ; conservation 30 minutes, historique incomplet.',
];
export const GEMINI_UNRESOLVED_NOTE = 'Gemini : dossier de certaines sessions non retrouvé ; ajoutez-le à paths dans projects.yaml.';

/** Every folder from which a hashed Gemini working directory may have been started. */
function hashCandidates(directories: Iterable<string>): Map<string, string> {
  const candidates = new Map<string, string>();
  for (const directory of directories) {
    for (let path = directory; ; path = dirname(path)) {
      const hash = geminiProjectHash(path);
      if (candidates.has(hash)) break; // Its ancestors are already in.
      candidates.set(hash, path);
      if (dirname(path) === path) break;
    }
  }
  return candidates;
}

export class LocalSessions {
  private readonly home: string;
  private readonly journals = new JournalCache();
  private readonly resolver: ProjectResolver;
  private readonly manifest?: ProjectManifestFile;
  private readonly aliasRules: ProjectRule[];
  private readonly sources: SessionSource[];
  private pending?: Promise<Snapshot>;
  private cached?: { at: number; value: Snapshot };
  constructor(private readonly options: Options = {}) {
    this.home = options.home ?? homedir();
    this.resolver = new ProjectResolver(options.gitProbe ?? gitProbe);
    this.manifest = options.manifestPath ? new ProjectManifestFile(options.manifestPath, this.home) : undefined;
    this.aliasRules = rulesFromAliases(options.aliases ?? {}, this.home);
    this.sources = options.sources ?? DEFAULT_SOURCES;
  }

  async snapshot(): Promise<Snapshot> {
    if (this.cached && Date.now() - this.cached.at < 5000) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.collect().then((value) => { this.cached = { at: Date.now(), value }; return value; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  /** Resolution is cached per directory inside the resolver; rules are re-applied on every snapshot. */
  private async project(facts: SessionFacts, config: ResolverConfig, moves: ProjectMove[]) {
    const resolution = await this.resolver.resolve(facts, config);
    if (resolution.legacyKey) moves.push({ from: resolution.legacyKey, to: resolution.key });
    return { projectKey: resolution.key, project: resolution.name, attachedTaskId: projectId(resolution.key),
      matchedBy: resolution.matchedBy, matchDetail: resolution.detail, ...(resolution.matchVia ? { matchVia: resolution.matchVia } : {}) };
  }

  private async collect(): Promise<Snapshot> {
    const errors: string[] = [];
    const coverage = [...HELPER_COVERAGE];
    const sessions: ObservedSession[] = [];
    const moves: ProjectMove[] = [];
    const loaded = this.manifest?.read() ?? {};
    if (loaded.error) errors.push(loaded.error); // A bad manifest is reported; automatic grouping still works.
    const config: ResolverConfig = { home: this.home, rules: [...(loaded.manifest?.rules ?? []), ...this.aliasRules],
      catchAll: loaded.manifest?.catchAll ?? defaultCatchAll(this.home) };
    const context: SourceContext = { home: this.home, env: this.options.env ?? {}, manifestRoots: loaded.manifest?.sources ?? {},
      journals: this.journals, now: Date.now() };
    const results = await Promise.all(this.sources.map(async (source): Promise<[SessionSource, SourceCollection]> => {
      try { return [source, await source.collect(context)]; } catch {
        return [source, { leads: [], helpers: [], errors: [`${source.label} : lecture impossible`], coverage: [], rootsFound: 0, rootsChecked: 0 }];
      }
    }));
    const hashed: CollectedLead[] = [];
    const folders: string[] = [this.home];
    for (const [, result] of results) {
      errors.push(...result.errors.filter((error) => !errors.includes(error)));
      coverage.push(...result.coverage.filter((note) => !coverage.includes(note)));
      for (const lead of result.leads) {
        if (lead.projectHash) { hashed.push(lead); continue; }
        if (lead.facts.cwd) folders.push(expandHome(lead.facts.cwd, this.home));
        sessions.push({ ...lead.session, ...await this.project(lead.facts, config, moves) });
      }
    }
    if (hashed.length) {
      // Gemini records a hash of its working directory, never the folder: match it against folders seen elsewhere.
      const known = hashCandidates([...folders, ...config.rules.flatMap((rule) => rule.paths), ...await this.resolver.knownDirectories()]);
      let unresolved = 0;
      for (const lead of hashed) {
        const cwd = known.get(lead.projectHash!);
        const project = await this.project({ ...lead.facts, cwd }, config, moves);
        if (!cwd && project.matchedBy === 'unassigned') {
          unresolved++;
          Object.assign(project, { matchVia: 'unknown-hash', matchDetail: `${lead.projectHash!.slice(0, 12)}…` });
        }
        sessions.push({ ...lead.session, ...project });
      }
      if (unresolved) coverage.push(GEMINI_UNRESOLVED_NOTE);
    }
    const leads = new Map(sessions.map((session) => [session.id, session]));
    for (const [, result] of results) {
      for (const helper of result.helpers) {
        // Helpers inherit their lead's project and its provenance.
        const parent = helper.parentId ? leads.get(helper.parentId) : undefined;
        if (!parent) continue;
        const child: ObservedSession = { ...helper, projectKey: parent.projectKey, project: parent.project, attachedTaskId: parent.attachedTaskId,
          matchedBy: parent.matchedBy, matchDetail: parent.matchDetail, ...(parent.matchVia ? { matchVia: parent.matchVia } : {}) };
        sessions.push(child); leads.set(child.id, child);
      }
    }
    const sources = results.map(([source, result]): ObservedSource => ({ id: source.id, label: source.label, experimental: source.experimental,
      status: result.rootsFound === 0 ? 'unavailable' : source.experimental ? 'experimental' : 'supported',
      rootsFound: result.rootsFound, rootsChecked: result.rootsChecked, sessions: result.leads.length }));
    return { sessions, errors, coverage, declared: loaded.manifest?.declared ?? [], moves, sources };
  }
}

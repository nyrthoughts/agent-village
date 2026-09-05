import type { ObservedSession, ObservedUpdate } from './observation.js';

export interface SourcedUpdate extends ObservedUpdate {
  sessionId: string;
  sessionTitle: string;
  tool: ObservedSession['tool'];
}
type Section = 'done' | 'next' | 'blocked';
export interface BriefingPoint {
  projectId: string;
  projectName: string;
  kind: 'blocked' | 'next' | 'report';
  entry: SourcedUpdate;
}

/** Recent source-backed points, not inferred priorities or a generated synthesis. */
export function villageBriefing(projects: { id: string; name: string; sessions: ObservedSession[] }[], read: Record<string, string>): BriefingPoint[] {
  return projects.flatMap((project): BriefingPoint[] => {
    const brief = projectBrief(project.sessions, read[project.id]);
    const latest = brief.latest;
    if (!latest || (read[project.id] && Date.parse(latest.at) <= Date.parse(read[project.id]!))) return [];
    const declared = declaredSections(latest);
    const kind = declared.blocked.length ? 'blocked' : declared.next.length ? 'next' : 'report';
    return [{ projectId: project.id, projectName: project.name, kind, entry: kind === 'report' ? latest : declared[kind][0]! }];
  }).sort((a, b) => Date.parse(b.entry.at) - Date.parse(a.entry.at) || a.projectId.localeCompare(b.projectId)).slice(0, 3);
}
const sections: Record<string, Section> = {
  fait: 'done', fini: 'done', termine: 'done', livre: 'done', realise: 'done', completed: 'done', done: 'done',
  suite: 'next', 'prochaine action': 'next', 'prochaines etapes': 'next', 'reste a faire': 'next', 'a faire': 'next', 'next steps': 'next',
  blocage: 'blocked', bloque: 'blocked', blockers: 'blocked', blocked: 'blocked',
};

function declaredSections(update: SourcedUpdate) {
  const result: Record<Section, SourcedUpdate[]> = { done: [], next: [], blocked: [] };
  let section: Section | undefined;
  for (const line of update.text.split('\n')) {
    const clean = line.trim().replace(/^[-*#]+\s*/, '').replace(/\*\*/g, '');
    const [heading, ...inline] = clean.split(':');
    const normalized = heading!.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const next = sections[normalized];
    if (next) {
      section = next;
      if (inline.join(':').trim()) result[section].push({ ...update, text: inline.join(':').trim().slice(0, 360) });
    } else if (/^\s*#/.test(line) || /^\*\*[^*]+\*\*\s*$/.test(line)) {
      section = undefined;
    } else if (section && clean) {
      result[section].push({ ...update, text: clean.slice(0, 360) });
    }
  }
  return result;
}

/** Extractive catch-up: no model call, invented completion or inferred remaining work. */
export function projectBrief(sessions: ObservedSession[], readThrough?: string) {
  const unique = new Map<string, SourcedUpdate>();
  for (const session of sessions) for (const update of session.history) {
    if (!Number.isFinite(Date.parse(update.at))) continue;
    const key = `${session.id}:${update.kind}:${update.at}:${update.text}`;
    unique.set(key, { ...update, sessionId: session.id, sessionTitle: session.title ?? session.id, tool: session.tool });
  }
  const updates = [...unique.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.sessionId.localeCompare(b.sessionId));
  const reports = updates.filter((update) => update.kind === 'report');
  const latestBySession = new Map<string, SourcedUpdate>();
  for (const report of reports) if (!latestBySession.has(report.sessionId)) latestBySession.set(report.sessionId, report);
  const reported: Record<Section, SourcedUpdate[]> = { done: [], next: [], blocked: [] };
  for (const report of latestBySession.values()) {
    const extracted = declaredSections(report);
    for (const section of ['done', 'next', 'blocked'] as const) reported[section].push(...extracted[section]);
  }
  for (const section of ['done', 'next', 'blocked'] as const) reported[section] = reported[section].slice(0, 5);
  return {
    latest: reports[0], previous: reports[1], current: [...latestBySession.values()].slice(0, 5),
    timeline: updates.slice(0, 120), reported,
    unread: readThrough ? updates.filter((update) => Date.parse(update.at) > Date.parse(readThrough)).length : 0,
    working: sessions.filter((session) => session.state === 'working').length,
    waiting: sessions.filter((session) => session.state === 'waiting').length,
  };
}

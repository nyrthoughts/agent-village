import type { VisitMarks } from '../../shared/boardView.js';

/**
 * Browser storage holds only sequence numbers, item identifiers and timestamps: never
 * conversation text, titles or tokens.
 */
const VISIT_KEY = 'agent-village:visit';
const SEEN_KEY = 'agent-village:seen';
const SNOOZE_KEY = 'agent-village:snooze';
const LEGACY_READ_KEY = 'agent-village:read';
const ID = /^[A-Za-z0-9._:@/+-]{1,300}$/;
const LIMIT = 400;

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as unknown; } catch { return null; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Memory-only when storage is unavailable. */ }
}

export function loadVisit(): VisitMarks | undefined {
  try { localStorage.removeItem(LEGACY_READ_KEY); } catch { /* Old timestamp reading points are retired. */ }
  const value = read(VISIT_KEY) as Partial<VisitMarks> | null;
  if (!value || typeof value.epoch !== 'string' || !(value.global === null || Number.isInteger(value.global)) || !value.projects || typeof value.projects !== 'object') return undefined;
  const projects = Object.fromEntries(Object.entries(value.projects).filter(([id, seq]) => ID.test(id) && Number.isInteger(seq)).slice(-LIMIT)) as Record<string, number>;
  return { epoch: value.epoch.slice(0, 80), global: value.global ?? null, projects };
}

export function saveVisit(visit: VisitMarks): void {
  const projects = Object.fromEntries(Object.entries(visit.projects).filter(([, seq]) => seq > (visit.global ?? -1)).slice(-LIMIT));
  write(VISIT_KEY, { epoch: visit.epoch, global: visit.global, projects });
}

export function loadSeen(): Record<string, true> {
  const value = read(SEEN_KEY);
  return Array.isArray(value) ? Object.fromEntries(value.filter((id): id is string => typeof id === 'string' && ID.test(id)).slice(-LIMIT).map((id) => [id, true as const])) : {};
}
export function saveSeen(seen: Record<string, true>): void { write(SEEN_KEY, Object.keys(seen).slice(-LIMIT)); }

export function loadSnoozed(now: number): Record<string, number> {
  const value = read(SNOOZE_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, number] => ID.test(entry[0]) && typeof entry[1] === 'number' && entry[1] > now).slice(-LIMIT));
}
export function saveSnoozed(snoozed: Record<string, number>): void { write(SNOOZE_KEY, snoozed); }

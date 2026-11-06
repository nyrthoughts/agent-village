import { afterEach, describe, expect, it } from 'vitest';
import { loadSeen, loadSnoozed, loadVisit, saveSeen, saveSnoozed, saveVisit } from './storage.js';

afterEach(() => localStorage.clear());

describe('board storage', () => {
  it('stores visit sequence numbers per journal epoch and retires timestamp reading points', () => {
    localStorage.setItem('agent-village:read', JSON.stringify({ 'project-a': '2026-10-01T10:00:00.000Z' }));
    expect(loadVisit()).toBeUndefined();
    expect(localStorage.getItem('agent-village:read')).toBeNull();
    saveVisit({ epoch: 'epoch-a', global: 12, projects: { 'project-a': 20, 'project-b': 5 } });
    expect(loadVisit()).toEqual({ epoch: 'epoch-a', global: 12, projects: { 'project-a': 20 } });
    saveVisit({ epoch: 'epoch-a', global: null, projects: { 'project-a': 3 } });
    expect(loadVisit()).toEqual({ epoch: 'epoch-a', global: null, projects: { 'project-a': 3 } });
  });

  it('keeps only identifiers and timestamps for seen and snoozed items, dropping expired snoozes and invalid entries', () => {
    saveSeen({ 'reply:agent_report:codex:a:4': true });
    expect(loadSeen()).toEqual({ 'reply:agent_report:codex:a:4': true });
    localStorage.setItem('agent-village:seen', JSON.stringify(['ok:id', 'not an id with spaces', 42]));
    expect(loadSeen()).toEqual({ 'ok:id': true });
    saveSnoozed({ 'decision:x:1': 2_000, 'decision:y:2': 500 });
    expect(loadSnoozed(1_000)).toEqual({ 'decision:x:1': 2_000 });
    expect(Object.values(localStorage).join('')).not.toMatch(/report text|title/);
  });
});

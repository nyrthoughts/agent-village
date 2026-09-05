import { describe, expect, it } from 'vitest';
import type { Worker } from './activity.js';
import { hasRecentActivity, isConfirmedWorking, presentWorkerState } from './workerPresentation.js';

const now = Date.parse('2026-09-05T12:00:00Z');
const worker = (overrides: Partial<Worker> = {}): Worker => ({
  id: 'fixture', tool: 'claude', state: 'working', lastActivityAt: new Date(now).toISOString(), ...overrides,
});
const evidence = (age: number, level: 'confirmed' | 'recent' | 'detected' = 'confirmed') => ({
  level, source: 'claude-process' as const, observedAt: new Date(now - age).toISOString(),
});

describe('confirmed worker presentation', () => {
  it.each([
    ['missing', undefined, false],
    ['detected', evidence(0, 'detected'), false],
    ['recent', evidence(0, 'recent'), true],
    ['confirmed', evidence(0), true],
    ['boundary', evidence(120_000, 'recent'), true],
    ['stale', evidence(120_001, 'recent'), false],
    ['future', evidence(-1), false],
    ['invalid', { ...evidence(0), observedAt: 'invalid' }, false],
  ] as const)('classifies %s activity freshness without requiring working state', (_label, activityEvidence, expected) => {
    expect(hasRecentActivity(worker({ state: 'waiting', activityEvidence }), now)).toBe(expected);
  });

  it.each([
    ['missing', undefined],
    ['recent', evidence(0, 'recent')],
    ['detected', evidence(0, 'detected')],
    ['stale', evidence(120_001)],
    ['future', evidence(-1)],
    ['invalid', { ...evidence(0), observedAt: 'invalid' }],
  ] as const)('does not promote %s evidence to native work', (_label, activityEvidence) => {
    const value = worker({ activityEvidence });
    expect(isConfirmedWorking(value, now)).toBe(false);
    expect(presentWorkerState(value, true, now)).toBe('unknown');
  });

  it.each([0, 60_000, 120_000])('accepts confirmed work observed %i ms ago', (age) => {
    const value = worker({ activityEvidence: evidence(age) });
    expect(isConfirmedWorking(value, now)).toBe(true);
    expect(presentWorkerState(value, true, now)).toBe('working');
  });

  it.each(['waiting', 'idle', 'unknown'] as const)('preserves %s without claiming active work', (state) => {
    const value = worker({ state, activityEvidence: evidence(0, 'recent') });
    expect(isConfirmedWorking(value, now)).toBe(false);
    expect(presentWorkerState(value, true, now)).toBe(state);
    expect(presentWorkerState(value, false, now)).toBe(state);
  });

  it('keeps fictional demo work without evidence but honors contradictory evidence', () => {
    expect(presentWorkerState(worker(), false, now)).toBe('working');
    expect(presentWorkerState(worker({ activityEvidence: evidence(0, 'recent') }), false, now)).toBe('unknown');
    expect(presentWorkerState(worker({ activityEvidence: evidence(120_001) }), false, now)).toBe('unknown');
  });
});

import { describe, expect, it } from 'vitest';
import { resolveMode } from './mode.js';

describe('resolveMode', () => {
  it('defaults to demo and accepts the closed modes', () => {
    expect(resolveMode({})).toBe('demo');
    expect(resolveMode({ VILLAGE_MODE: 'demo' })).toBe('demo');
    expect(resolveMode({ VILLAGE_MODE: 'live' })).toBe('live');
    expect(resolveMode({ VILLAGE_MODE: 'truth-only' })).toBe('truth-only');
    expect(resolveMode({ VILLAGE_MODE: 'native' })).toBe('native');
  });

  it('rejects unknown modes', () => {
    expect(() => resolveMode({ VILLAGE_MODE: 'magic' })).toThrow('VILLAGE_MODE');
  });
});

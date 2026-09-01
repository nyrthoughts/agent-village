import { describe, expect, it } from 'vitest';
import { redactTitle } from './redact.js';

describe('redactTitle', () => {
  it('removes paths, email addresses and common secret shapes', () => {
    const privatePath = ['', 'Users', 'demo', 'private'].join('/');
    const input = `Build ${privatePath} for demo@example.test with sk-secretvalue123`;
    const output = redactTitle(input);
    expect(output).not.toContain(privatePath);
    expect(output).not.toContain('@');
    expect(output).not.toContain('secretvalue');
  });

  it('caps and normalizes visible titles', () => {
    expect(redactTitle(`  ${'work '.repeat(40)}  `).length).toBeLessThanOrEqual(120);
    expect(redactTitle('  atlas   contours  ')).toBe('atlas contours');
  });
});

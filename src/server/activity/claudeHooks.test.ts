import { describe, expect, it } from 'vitest';
import { mergeClaudeHooks, removeClaudeHooks } from './claudeHooks.js';

describe('Claude Code hook settings', () => {
  it('adds silent loopback hooks without replacing existing settings', () => {
    const original = {
      permissions: { allow: ['Bash(git status)'] },
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'existing-stop' }] }],
      },
    };
    const merged = mergeClaudeHooks(original, 'http://127.0.0.1:4180/api/hooks/claude');

    expect(merged.permissions).toEqual(original.permissions);
    expect(merged.hooks.Stop).toHaveLength(2);
    expect(JSON.stringify(merged)).toContain('agent-village-hook');
    expect(JSON.stringify(merged)).toContain('127.0.0.1:4180/api/hooks/claude');
    expect(merged.hooks.SubagentStart).toHaveLength(1);
    expect(merged.hooks.SubagentStop).toHaveLength(1);
  });

  it('is idempotent and can remove only Agent Village hooks', () => {
    const once = mergeClaudeHooks({}, 'http://127.0.0.1:4180/api/hooks/claude');
    const twice = mergeClaudeHooks(once, 'http://127.0.0.1:4180/api/hooks/claude');
    expect(twice).toEqual(once);

    const removed = removeClaudeHooks(twice);
    expect(JSON.stringify(removed)).not.toContain('agent-village-hook');
  });
});

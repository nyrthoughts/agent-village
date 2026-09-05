import { describe, expect, it } from 'vitest';
import { mergeClaudeHooks, removeClaudeHooks } from './claudeHooks.js';
const headerPath = '/private/owner/ingestion.header';

describe('Claude Code hook settings', () => {
  it('adds silent loopback hooks without replacing existing settings', () => {
    const original = {
      permissions: { allow: ['Bash(git status)'] },
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'existing-stop' }] }],
      },
    };
    const merged = mergeClaudeHooks(original, 'http://127.0.0.1:4180/api/hooks/claude', headerPath);

    expect(merged.permissions).toEqual(original.permissions);
    expect(merged.hooks.Stop).toHaveLength(2);
    expect(JSON.stringify(merged)).toContain('agent-village-hook');
    expect(JSON.stringify(merged)).toContain('127.0.0.1:4180/api/hooks/claude');
    expect(merged.hooks.SubagentStart).toHaveLength(1);
    expect(merged.hooks.SubagentStop).toHaveLength(1);
    const command = merged.hooks.Stop?.[1]?.hooks[0]?.command;
    expect(command).toMatch(/^curl -q --noproxy '\*' --proto '=http' --max-redirs 0 /);
    expect(command).not.toContain('--location');
  });

  it('is idempotent and can remove only Agent Village hooks', () => {
    const once = mergeClaudeHooks({}, 'http://127.0.0.1:4180/api/hooks/claude', headerPath);
    const twice = mergeClaudeHooks(once, 'http://127.0.0.1:4180/api/hooks/claude', headerPath);
    expect(twice).toEqual(once);

    const removed = removeClaudeHooks(twice);
    expect(JSON.stringify(removed)).not.toContain('agent-village-hook');
  });
  it('replaces old unsecured marked hooks while retaining unrelated handlers', () => {
    const original = { permissions: { allow: [] }, hooks: { Stop: [{ matcher: '*', hooks: [
      { type: 'command', command: 'curl old # agent-village-hook' },
      { type: 'command', command: 'keep me' },
    ] }] } };
    const merged = mergeClaudeHooks(original, 'http://localhost:4180/api/hooks/claude', headerPath);
    expect(JSON.stringify(merged)).not.toContain('curl old');
    expect(JSON.stringify(merged)).toContain('keep me');
    expect(JSON.stringify(merged)).toContain(`@${headerPath}`);
    expect(JSON.stringify(merged)).not.toContain('Bearer');
    expect(merged.hooks.Stop).toHaveLength(2);
  });
  it('rejects external endpoints, URL credentials and unsafe header paths', () => {
    for (const url of ['https://evil.example/api/hooks/claude', 'http://user:pass@localhost:4180/api/hooks/claude',
      'http://localhost:4180/api/hooks/claude?redirect=evil', 'http://localhost:4180/shell']) {
      expect(() => mergeClaudeHooks({}, url, headerPath)).toThrow();
    }
    expect(() => mergeClaudeHooks({}, 'http://localhost:4180/api/hooks/claude', 'relative')).toThrow();
    expect(() => mergeClaudeHooks({}, 'http://localhost:4180/api/hooks/claude', '/tmp/bad\nheader')).toThrow();
  });
});

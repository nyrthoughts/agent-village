import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../integrations/openclaw/', import.meta.url);

describe('OpenClaw integration package', () => {
  it('ships an installable observation-only plugin for supported lifecycle hooks', async () => {
    const manifest = JSON.parse(await readFile(new URL('openclaw.plugin.json', root), 'utf8')) as { id?: string; configSchema?: unknown };
    const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as { openclaw?: { extensions?: string[] } };
    const source = await readFile(new URL('index.ts', root), 'utf8');

    expect(manifest.id).toBe('agent-village');
    expect(pkg.openclaw?.extensions).toEqual(['./index.ts']);
    expect(source).toContain('api.on("session_start"');
    expect(source).toContain('api.on("agent_end"');
    expect(source).toContain('api.on("session_end"');
    expect(source).not.toContain('event.prompt');
    expect(source).not.toContain('event.messages');
  });
});

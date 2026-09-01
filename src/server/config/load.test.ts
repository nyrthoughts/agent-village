import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkspace } from './load.js';

const tempDirs: string[] = [];

function writeTempYaml(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-village-'));
  tempDirs.push(dir);
  const file = join(dir, 'village.yaml');
  writeFileSync(file, contents, 'utf8');
  return file;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadWorkspace', () => {
  it('loads the demo fixture', () => {
    const result = loadWorkspace(new URL('../../../fixtures/village.demo.yaml', import.meta.url).pathname);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspace.version).toBe(1);
      expect(result.workspace.projects.length).toBeGreaterThan(0);
    }
  });

  it('returns a structured error for malformed YAML', () => {
    const file = writeTempYaml('version: 1\nname: [unclosed');
    const result = loadWorkspace(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.path).toBe('');
      expect(result.errors[0]!.message).toMatch(/yaml/i);
    }
  });

  it('returns a structured error for a missing file', () => {
    const result = loadWorkspace(join(tmpdir(), 'agent-village-nope', 'village.yaml'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.message).toMatch(/read/i);
    }
  });

  it('returns path-aware errors for schema violations', () => {
    const file = writeTempYaml(
      [
        'version: 1',
        'name: Broken',
        'projects:',
        '  - id: p1',
        '    name: P1',
        '    objective: Try',
        '    features: []',
        '    tasks:',
        '      - id: t1',
        '        title: T1',
        '        status: done',
        '        subtasks: []',
        '        evidence: []',
      ].join('\n'),
    );
    const result = loadWorkspace(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === 'projects.0.tasks.0.status')).toBe(true);
    }
  });
});

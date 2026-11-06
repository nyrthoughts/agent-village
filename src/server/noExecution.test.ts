import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = resolve('src/server');
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? sources(join(directory, entry.name))
    : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [join(directory, entry.name)] : []);
}

describe('observation is not execution', () => {
  it('has no Codex app-server provider (it started a Codex process)', () => {
    expect(existsSync(join(serverRoot, 'activity', 'codexProvider.ts'))).toBe(false);
  });

  it('limits subprocesses to read-only collectors and never runs an agent binary', () => {
    const allowed = new Map([
      // sqlite3 -readonly and git metadata reads by the periodic native collector.
      ['activity/localSessions.ts', ['sqlite3', 'git']],
      // git cat-file for YAML commit evidence, run by the background YAML board.
      ['truth/evidence/commit.ts', ['git']],
      // Opt-in `gh api --method GET`, periodic timer only.
      ['sources/github.ts', ['gh']],
    ]);
    for (const file of sources(serverRoot)) {
      const text = readFileSync(file, 'utf8');
      const name = relative(serverRoot, file);
      if (!/node:child_process/.test(text)) continue;
      expect(allowed.has(name), `${name} imports child_process`).toBe(true);
      // Only execFile (no shell, explicit binary) may be imported.
      const imported = /import\s*\{([^}]*)\}\s*from\s*'node:child_process'/.exec(text)?.[1]?.split(',').map((entry) => entry.trim()).filter(Boolean);
      expect(imported, `${name} child_process imports`).toEqual(['execFile']);
      const binaries = [...text.matchAll(/execFile\(\s*'([^']+)'|execute\(\s*'([^']+)'/g)].map((match) => match[1] ?? match[2]);
      expect(binaries.every((binary) => allowed.get(name)!.includes(binary!)), `${name} runs ${binaries.join(',')}`).toBe(true);
      expect(text).not.toMatch(/['"](?:codex|claude|openclaw)['"]\s*,\s*\[/);
    }
    const router = readFileSync(join(serverRoot, 'router.ts'), 'utf8');
    expect(router).not.toMatch(/child_process|execFile|spawn/);
    // The GitHub reader only ever issues GET requests.
    expect(readFileSync(join(serverRoot, 'sources', 'github.ts'), 'utf8')).toContain("['api', '--method', 'GET', '--include'");
  });
});

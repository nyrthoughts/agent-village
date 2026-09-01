import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SHA_PATTERN, verifyCommit, type ExecGit } from './commit.js';

let yamlDir: string;
let headSha: string;
let outsideDir: string;

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

beforeAll(() => {
  yamlDir = mkdtempSync(join(tmpdir(), 'agent-village-evidence-'));
  outsideDir = mkdtempSync(join(tmpdir(), 'agent-village-outside-'));
  const repo = join(yamlDir, 'repos', 'demo');
  mkdirSync(repo, { recursive: true });
  git(['init'], repo);
  writeFileSync(join(repo, 'file.txt'), 'hello\n', 'utf8');
  git(['add', 'file.txt'], repo);
  git(
    ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.invalid', 'commit', '-m', 'initial'],
    repo,
  );
  headSha = git(['rev-parse', 'HEAD'], repo);
});

afterAll(() => {
  rmSync(yamlDir, { recursive: true, force: true });
  rmSync(outsideDir, { recursive: true, force: true });
});

describe('SHA_PATTERN', () => {
  it('accepts 7 to 40 lowercase hex characters only', () => {
    expect(SHA_PATTERN.test('a1b2c3d')).toBe(true);
    expect(SHA_PATTERN.test('a'.repeat(40))).toBe(true);
    expect(SHA_PATTERN.test('a1b2c3')).toBe(false);
    expect(SHA_PATTERN.test('a'.repeat(41))).toBe(false);
    expect(SHA_PATTERN.test('A1B2C3D')).toBe(false);
    expect(SHA_PATTERN.test('HEAD')).toBe(false);
  });
});

describe('verifyCommit', () => {
  it('verifies an existing commit by full sha', async () => {
    const verdict = await verifyCommit({ repo: 'repos/demo', sha: headSha }, yamlDir);
    expect(verdict).toBe('verified');
  });

  it('verifies an existing commit by abbreviated sha', async () => {
    const verdict = await verifyCommit(
      { repo: 'repos/demo', sha: headSha.slice(0, 7) },
      yamlDir,
    );
    expect(verdict).toBe('verified');
  });

  it('rejects a well-formed sha that is not in the repo', async () => {
    const absent = headSha.startsWith('aaaaaaa') ? 'b'.repeat(40) : 'a'.repeat(40);
    const verdict = await verifyCommit({ repo: 'repos/demo', sha: absent }, yamlDir);
    expect(verdict).toBe('invalid');
  });

  it('rejects a repo directory that does not exist', async () => {
    const verdict = await verifyCommit({ repo: 'repos/missing', sha: headSha }, yamlDir);
    expect(verdict).toBe('invalid');
  });

  it('rejects malformed shas before any git call', async () => {
    const execGit = vi.fn<ExecGit>();
    for (const sha of ['HEAD', 'main', 'a1b2c3', 'A1B2C3D', `${headSha} --help`, '']) {
      const verdict = await verifyCommit({ repo: 'repos/demo', sha }, yamlDir, execGit);
      expect(verdict).toBe('invalid');
    }
    expect(execGit).not.toHaveBeenCalled();
  });

  it('rejects repo paths that resolve outside the village yaml directory', async () => {
    const execGit = vi.fn<ExecGit>();
    for (const repo of ['../elsewhere', 'repos/../../elsewhere', '/etc']) {
      const verdict = await verifyCommit({ repo, sha: headSha }, yamlDir, execGit);
      expect(verdict).toBe('invalid');
    }
    expect(execGit).not.toHaveBeenCalled();
  });

  it('rejects a symlinked repo that escapes the village yaml directory', async () => {
    symlinkSync(outsideDir, join(yamlDir, 'repos', 'escape'), 'dir');
    const execGit = vi.fn<ExecGit>();

    const verdict = await verifyCommit(
      { repo: 'repos/escape', sha: headSha },
      yamlDir,
      execGit,
    );

    expect(verdict).toBe('invalid');
    expect(execGit).not.toHaveBeenCalled();
  });
});

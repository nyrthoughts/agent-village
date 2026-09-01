import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { EvidenceVerdict } from '../derive.js';

// Rejected before any git process is spawned; abbreviations shorter than
// seven characters are too ambiguous to count as evidence.
export const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

export type ExecGit = (args: string[], cwd: string) => Promise<void>;

const defaultExecGit: ExecGit = (args, cwd) =>
  new Promise((resolvePromise, rejectPromise) => {
    execFile('git', args, { cwd, timeout: 5000 }, (error) =>
      error ? rejectPromise(error) : resolvePromise(),
    );
  });

export interface CommitEvidenceInput {
  repo: string;
  sha: string;
}

export async function verifyCommit(
  evidence: CommitEvidenceInput,
  yamlDir: string,
  execGit: ExecGit = defaultExecGit,
): Promise<EvidenceVerdict> {
  if (!SHA_PATTERN.test(evidence.sha)) {
    return 'invalid';
  }

  // The schema already forbids absolute and upward-traversing repo paths;
  // this re-check keeps the boundary even for objects built in code.
  const lexicalBase = resolve(yamlDir);
  const lexicalRepoPath = resolve(lexicalBase, evidence.repo);
  if (lexicalRepoPath !== lexicalBase && !lexicalRepoPath.startsWith(lexicalBase + sep)) {
    return 'invalid';
  }

  try {
    const [base, repoPath] = await Promise.all([
      realpath(lexicalBase),
      realpath(lexicalRepoPath),
    ]);
    if (repoPath !== base && !repoPath.startsWith(base + sep)) {
      return 'invalid';
    }
    await execGit(['-C', repoPath, 'cat-file', '-e', `${evidence.sha}^{commit}`], base);
    return 'verified';
  } catch {
    return 'invalid';
  }
}

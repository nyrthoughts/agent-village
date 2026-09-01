import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadWorkspace } from '../config/load.js';
import { deriveWorkspace } from './derive.js';
import { verifyWorkspaceEvidence } from './evidence/verify.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixturePath = join(root, 'fixtures', 'village.demo.yaml');

describe('canonical demo fixture', () => {
  it('maps every public demo node to its evidence-derived status', async () => {
    const loaded = loadWorkspace(fixturePath);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
    const verdicts = await verifyWorkspaceEvidence(loaded.workspace, dirname(fixturePath));
    const derived = deriveWorkspace(loaded.workspace, verdicts);
    const statuses: Record<string, string> = {};

    for (const project of derived.projects) {
      for (const feature of project.features) {
        for (const task of feature.tasks) {
          statuses[task.id] = task.effectiveStatus;
          for (const subtask of task.subtasks) statuses[subtask.id] = subtask.effectiveStatus;
        }
      }
      for (const task of project.tasks) statuses[task.id] = task.effectiveStatus;
    }

    expect(statuses).toEqual({
      'atlas-contours': 'in_progress',
      'atlas-contours-foundation': 'verified',
      'atlas-contours-relief': 'in_progress',
      'atlas-observatory': 'awaiting_review',
      'atlas-observatory-deck': 'verified',
      'atlas-bridge': 'blocked',
      'atlas-bridge-footing': 'planned',
      'atlas-library': 'verified',
      'atlas-weather': 'in_progress',
      'beacon-relay': 'planned',
      'beacon-lens': 'verified',
      'beacon-lens-frame': 'verified',
      'beacon-notes': 'in_progress',
    });
  });

  it('passes the public hygiene gate', () => {
    expect(() => execFileSync(process.execPath, [join(root, 'scripts/check-clean.mjs')])).not.toThrow();
  });

  it('makes the hygiene gate fail on a private identifier', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-village-hygiene-'));
    const privateName = [78, 121, 108, 97, 110]
      .map((value) => String.fromCharCode(value))
      .join('');
    writeFileSync(join(directory, 'private.txt'), privateName, 'utf8');
    try {
      expect(() =>
        execFileSync(process.execPath, [join(root, 'scripts/check-clean.mjs'), '--root', directory]),
      ).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

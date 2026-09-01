import { describe, expect, it } from 'vitest';
import { workspaceSchema } from './schema.js';

function validWorkspace() {
  return {
    version: 1,
    name: 'Verdant Labs',
    projects: [
      {
        id: 'atlas',
        name: 'Atlas',
        objective: 'Chart the demo territory',
        features: [
          {
            id: 'atlas-mapping',
            title: 'Mapping',
            tasks: [
              {
                id: 'atlas-mapping-grid',
                title: 'Draw the grid',
                owner: 'ada',
                status: 'in_progress',
                nextAction: 'Finish the northern quadrant',
                resumeHint: 'See grid sketch in the drawer',
                subtasks: [
                  {
                    id: 'atlas-mapping-grid-axes',
                    title: 'Axes',
                    status: 'verified',
                    evidence: [
                      { type: 'commit', repo: 'repos/atlas', sha: 'a1b2c3d' },
                    ],
                  },
                ],
                evidence: [
                  { type: 'human_review', reviewer: 'grace', state: 'pending' },
                ],
              },
            ],
          },
        ],
        tasks: [
          {
            id: 'atlas-standalone',
            title: 'Standalone chore',
            subtasks: [],
            evidence: [],
          },
        ],
      },
    ],
    activity_mapping: [{ match: 'atlas grid', taskId: 'atlas-mapping-grid' }],
  };
}

describe('workspaceSchema', () => {
  it('accepts a fully valid workspace', () => {
    const result = workspaceSchema.safeParse(validWorkspace());
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const ws = validWorkspace();
    (ws.projects[0]!.features[0]!.tasks[0] as { status: string }).status = 'done';
    const result = workspaceSchema.safeParse(ws);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown evidence type', () => {
    const ws = validWorkspace();
    ws.projects[0]!.features[0]!.tasks[0]!.evidence = [
      { type: 'vibes', reviewer: 'grace', state: 'pending' } as never,
    ];
    const result = workspaceSchema.safeParse(ws);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate ids anywhere in the workspace', () => {
    const ws = validWorkspace();
    ws.projects[0]!.tasks[0]!.id = 'atlas-mapping-grid';
    const result = workspaceSchema.safeParse(ws);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duplicate'))).toBe(true);
    }
  });

  it('rejects a workspace without version 1', () => {
    const ws = validWorkspace() as Record<string, unknown>;
    delete ws.version;
    const result = workspaceSchema.safeParse(ws);
    expect(result.success).toBe(false);
  });

  it('rejects absolute evidence repo paths', () => {
    const ws = validWorkspace();
    ws.projects[0]!.features[0]!.tasks[0]!.subtasks[0]!.evidence = [
      { type: 'commit', repo: ['', 'Users', 'somebody', 'atlas'].join('/'), sha: 'a1b2c3d' },
    ];
    const result = workspaceSchema.safeParse(ws);
    expect(result.success).toBe(false);
  });
});

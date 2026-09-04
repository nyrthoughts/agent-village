import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorkspace } from '../config/load.js';

describe('observer fixture', () => {
  it('contains no fictional tasks or mappings', () => {
    const loaded = loadWorkspace(resolve('fixtures/village.observer.yaml'));

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.workspace.name).toBe('My Agent Village');
    expect(loaded.workspace.projects).toHaveLength(1);
    expect(loaded.workspace.projects.flatMap((project) => [
      ...project.tasks,
      ...project.features.flatMap((feature) => feature.tasks),
    ])).toEqual([]);
    expect(loaded.workspace.activity_mapping).toBeUndefined();
  });
});

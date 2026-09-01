import { Mesh, type Material } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { buildSceneContent, syncActivity } from './sceneFactory.js';

function task(id: string, status: DerivedTask['effectiveStatus']): DerivedTask {
  return {
    id,
    title: id,
    effectiveStatus: status,
    warnings: [],
    roof: status === 'verified',
    subtasks: [],
  };
}

const village: DerivedWorkspace = {
  version: 1,
  name: 'Verdant Labs',
  projects: [
    {
      id: 'atlas',
      name: 'Atlas',
      objective: 'Map the valley',
      effectiveStatus: 'blocked',
      features: [{
        id: 'atlas-yard',
        title: 'Atlas yard',
        effectiveStatus: 'in_progress',
        tasks: [task('atlas-bridge', 'blocked'), task('atlas-observatory', 'awaiting_review')],
      }],
      tasks: [task('atlas-library', 'verified')],
    },
    {
      id: 'beacon',
      name: 'Beacon',
      objective: 'Light the approach',
      effectiveStatus: 'in_progress',
      features: [],
      tasks: [task('beacon-relay', 'planned')],
    },
  ],
};

const activity: ActivitySnapshot = {
  status: 'live',
  fetchedAt: '2026-08-31T20:00:00.000Z',
  workers: [
    { id: 'worker-c', tool: 'codex', state: 'working', attachedTaskId: 'atlas-bridge', lastActivityAt: '2026-08-31T20:00:00.000Z' },
    { id: 'worker-x', tool: 'claude', state: 'waiting', lastActivityAt: '2026-08-31T20:00:00.000Z' },
  ],
};

describe('buildSceneContent', () => {
  it('assembles one real district and building group per truth record', () => {
    const content = buildSceneContent(village);

    expect(content.root.getObjectByName('district:atlas')).toBeDefined();
    expect(content.root.getObjectByName('district:beacon')).toBeDefined();
    expect(content.root.getObjectByName('compound:atlas-yard')).toBeDefined();
    expect(content.root.getObjectByName('path:atlas')).toBeDefined();
    expect(content.root.getObjectByName('tree:atlas:0')).toBeDefined();
    expect(content.root.getObjectByName('world-water')).toBeDefined();
    expect(content.root.getObjectByName('district-sand:atlas')).toBeDefined();
    expect(content.root.getObjectByName('district-grass:atlas')).toBeDefined();
    expect(content.root.getObjectByName('plaza:atlas')).toBeDefined();
    expect(content.root.getObjectByName('flower-bed:atlas:0')).toBeDefined();
    expect([...content.buildings.keys()]).toEqual([
      'atlas-bridge', 'atlas-observatory', 'atlas-library', 'beacon-relay',
    ]);
    expect(content.buildingAnchors.get('atlas-library')?.y).toBeGreaterThan(0);
  });

  it('syncs workers separately without rebuilding or mutating buildings', () => {
    const content = buildSceneContent(village);
    const bridge = content.buildings.get('atlas-bridge');
    expect(bridge).toBeDefined();
    const bridgeChildren = bridge!.children.length;

    syncActivity(content, activity);
    expect(content.workerRoot.children).toHaveLength(2);
    expect(content.workerRoot.getObjectByName('worker:worker-c')?.userData.attachedTaskId)
      .toBe('atlas-bridge');
    expect(content.workerRoot.getObjectByName('worker:worker-x')?.userData.attachedTaskId)
      .toBeUndefined();
    const workerMesh = content.workerRoot.children[0]!.children[0] as Mesh;
    const disposeMaterial = vi.spyOn(workerMesh.material as Material, 'dispose');

    syncActivity(content, { ...activity, status: 'degraded', workers: [] });
    expect(content.workerRoot.children).toHaveLength(0);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(content.buildings.get('atlas-bridge')).toBe(bridge);
    expect(bridge?.children).toHaveLength(bridgeChildren);
  });
});

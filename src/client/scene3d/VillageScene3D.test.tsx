import { fireEvent, render } from '@testing-library/react';
import type { WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { VillageScene3D, type RendererFactory } from './VillageScene3D.js';

function task(id: string): DerivedTask {
  return { id, title: id, effectiveStatus: 'in_progress', warnings: [], roof: false, subtasks: [] };
}

const village: DerivedWorkspace = {
  version: 1,
  name: 'Test village',
  projects: [{
    id: 'project',
    name: 'Project',
    objective: 'Build it',
    effectiveStatus: 'in_progress',
    features: [],
    tasks: [task('one'), task('two')],
  }],
};

const activity: ActivitySnapshot = {
  status: 'live',
  fetchedAt: '2026-08-31T20:00:00.000Z',
  workers: [{ id: 'worker', tool: 'codex', state: 'working', attachedTaskId: 'one', lastActivityAt: '2026-08-31T20:00:00.000Z' }],
};

describe('VillageScene3D', () => {
  it('sets up once, syncs activity separately and disposes owned browser resources', () => {
    const canvas = document.createElement('canvas');
    const renderer = {
      domElement: canvas,
      shadowMap: { enabled: false },
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const rendererFactory = vi.fn(() => renderer as unknown as WebGLRenderer) as RendererFactory;
    const disconnect = vi.fn();
    class ResizeObserverStub {
      observe = vi.fn();
      disconnect = disconnect;
      constructor(callback: ResizeObserverCallback) {
        callback([{ contentRect: { width: 900, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const requestFrame = vi.fn(() => 7);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    const onUnavailable = vi.fn();

    const view = render(<VillageScene3D village={village} activity={activity} rendererFactory={rendererFactory} onSelect={vi.fn()} onUnavailable={onUnavailable} />);
    const root = view.getByTestId('village-scene-3d');
    expect(rendererFactory).toHaveBeenCalledTimes(1);
    expect(root.getAttribute('data-building-count')).toBe('2');
    expect(root.getAttribute('data-worker-count')).toBe('1');
    expect(root.getAttribute('data-camera-target')).toBe('0.000:0.000');
    expect(renderer.render).toHaveBeenCalled();
    const rendersBeforeReset = renderer.render.mock.calls.length;
    fireEvent.click(view.getByRole('button', { name: 'Reset 3D view' }));
    expect(renderer.render.mock.calls.length).toBeGreaterThan(rendersBeforeReset);

    view.rerender(<VillageScene3D village={{ ...village, projects: [...village.projects] }} activity={{ ...activity, status: 'degraded', workers: [] }} rendererFactory={rendererFactory} onSelect={vi.fn()} onUnavailable={onUnavailable} />);
    expect(rendererFactory).toHaveBeenCalledTimes(1);
    expect(root.getAttribute('data-building-count')).toBe('2');
    expect(root.getAttribute('data-worker-count')).toBe('0');

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onUnavailable).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(requestFrame).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

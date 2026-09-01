import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  cameraPositionFor,
  clampZoom,
  createCameraController,
  orthographicBounds,
  panTarget,
} from './cameraController.js';

describe('isometric camera helpers', () => {
  it('clamps zoom and keeps one fixed isometric direction', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(cameraPositionFor({ x: 0, z: 0 }, 20)).toEqual({ x: 20, y: 18, z: 20 });
    expect(cameraPositionFor({ x: 3, z: -2 }, 20)).toEqual({ x: 23, y: 18, z: 18 });
  });

  it('pans only on the ground plane and scales with the viewport', () => {
    const normal = panTarget({ x: 2, z: 4 }, { x: 100, y: -50 }, 1000, 1);
    expect(normal.x).toBeCloseTo(-1.8);
    expect(normal.z).toBeCloseTo(2.1);
    const zoomed = panTarget({ x: 2, z: 4 }, { x: 100, y: -50 }, 1000, 2);
    expect(zoomed.x).toBeCloseTo(0.1);
    expect(zoomed.z).toBeCloseTo(3.05);
  });

  it('fits orthographic bounds to portrait and landscape ratios', () => {
    expect(orthographicBounds(1600, 800)).toEqual({ left: -38, right: 38, top: 19, bottom: -19 });
    expect(orthographicBounds(400, 800)).toEqual({ left: -19, right: 19, top: 38, bottom: -38 });
  });
});

describe('createCameraController', () => {
  it('projects world anchors and removes every input listener on dispose', () => {
    const canvas = document.createElement('canvas');
    const add = vi.spyOn(canvas, 'addEventListener');
    const remove = vi.spyOn(canvas, 'removeEventListener');
    const controller = createCameraController(canvas);
    const initialRotation = controller.camera.rotation.toArray();

    controller.updateViewport(800, 400);
    const initialState = controller.getState();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, cancelable: true }));
    expect(controller.getState().zoom).toBeGreaterThan(initialState.zoom);
    expect(controller.getState().azimuth).toBe(45);
    controller.reset();
    expect(controller.getState()).toEqual(initialState);
    const projection = controller.project(new Vector3(0, 0, 0), 800, 400);
    expect(projection.visible).toBe(true);
    expect(projection.x).toBeCloseTo(400, 0);
    expect(projection.y).toBeCloseTo(200, 0);
    expect(controller.camera.rotation.toArray()).toEqual(initialRotation);

    controller.dispose();
    expect(add.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining([
      'pointerdown', 'pointermove', 'pointerup', 'wheel',
    ]));
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
  });

  it('starts close enough on compact screens for buildings to remain readable', () => {
    const canvas = document.createElement('canvas');
    const controller = createCameraController(canvas);
    controller.updateViewport(390, 320);
    expect(controller.getState().zoom).toBeCloseTo(1.18);
    controller.dispose();
  });
});

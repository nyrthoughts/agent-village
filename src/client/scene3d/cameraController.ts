import { OrthographicCamera, Vector3 } from 'three';

export const MIN_ZOOM = 0.65;
export const MAX_ZOOM = 2.2;
const HALF_VIEW = 19;
const CAMERA_DISTANCE = 24;

export interface GroundTarget { x: number; z: number }
export interface ScreenDelta { x: number; y: number }
export interface CameraProjection { x: number; y: number; visible: boolean }
export interface CameraState { zoom: number; target: GroundTarget; azimuth: 45 }

export interface CameraController {
  camera: OrthographicCamera;
  updateViewport(width: number, height: number): void;
  project(world: Vector3, width: number, height: number): CameraProjection;
  getState(): CameraState;
  reset(): void;
  dispose(): void;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function cameraPositionFor(target: GroundTarget, distance: number): {
  x: number;
  y: number;
  z: number;
} {
  return { x: target.x + distance, y: distance * 0.9, z: target.z + distance };
}

export function panTarget(
  target: GroundTarget,
  delta: ScreenDelta,
  viewportWidth: number,
  zoom: number,
): GroundTarget {
  const worldPerPixel = (HALF_VIEW * 2) / Math.max(1, viewportWidth) / zoom;
  return {
    x: target.x - delta.x * worldPerPixel,
    z: target.z + delta.y * worldPerPixel,
  };
}

export function orthographicBounds(width: number, height: number): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const halfWidth = aspect >= 1 ? HALF_VIEW * aspect : HALF_VIEW;
  const halfHeight = aspect >= 1 ? HALF_VIEW : HALF_VIEW / aspect;
  return { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight };
}

export function createCameraController(
  canvas: HTMLCanvasElement,
  onChange: () => void = () => undefined,
): CameraController {
  const camera = new OrthographicCamera(-HALF_VIEW, HALF_VIEW, HALF_VIEW, -HALF_VIEW, 0.1, 200);
  let target: GroundTarget = { x: 0, z: 0 };
  let zoom = 1;
  let defaultZoom = 1;
  let viewportWidth = 1;
  let hasSized = false;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDistance: number | undefined;

  const positionCamera = () => {
    const position = cameraPositionFor(target, CAMERA_DISTANCE);
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(target.x, 0, target.z);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  const onPointerDown = (event: PointerEvent) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      target = panTarget(
        target,
        { x: event.clientX - previous.x, y: event.clientY - previous.y },
        viewportWidth,
        zoom,
      );
    } else if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(first!.x - second!.x, first!.y - second!.y);
      if (pinchDistance !== undefined) zoom = clampZoom(zoom * distance / pinchDistance);
      pinchDistance = distance;
    }
    positionCamera();
    onChange();
  };

  const releasePointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = undefined;
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    zoom = clampZoom(zoom * Math.exp(-event.deltaY * 0.0012));
    positionCamera();
    onChange();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('pointerleave', releasePointer);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  positionCamera();

  return {
    camera,
    updateViewport(width, height) {
      viewportWidth = Math.max(1, width);
      if (!hasSized && width < 600) {
        zoom = 0.72;
        defaultZoom = 0.72;
      }
      hasSized = true;
      const bounds = orthographicBounds(width, height);
      camera.left = bounds.left;
      camera.right = bounds.right;
      camera.top = bounds.top;
      camera.bottom = bounds.bottom;
      positionCamera();
    },
    project(world, width, height) {
      camera.updateMatrixWorld();
      const projected = world.clone().project(camera);
      return {
        x: (projected.x + 1) * width / 2,
        y: (1 - projected.y) * height / 2,
        visible: projected.z >= -1 && projected.z <= 1
          && projected.x >= -1 && projected.x <= 1
          && projected.y >= -1 && projected.y <= 1,
      };
    },
    getState() {
      return { zoom, target: { ...target }, azimuth: 45 };
    },
    reset() {
      target = { x: 0, z: 0 };
      zoom = defaultZoom;
      positionCamera();
      onChange();
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', releasePointer);
      canvas.removeEventListener('pointercancel', releasePointer);
      canvas.removeEventListener('pointerleave', releasePointer);
      canvas.removeEventListener('wheel', onWheel);
      pointers.clear();
    },
  };
}

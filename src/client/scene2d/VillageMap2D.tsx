import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import type { DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { PixelBuilding } from './PixelBuilding.js';
import { PixelTerrain, TILE_SIZE } from './PixelTerrain.js';
import { PixelWorker } from './PixelWorker.js';
import { layoutVillage2d } from './villageLayout2d.js';

interface VillageMap2DProps {
  village: DerivedWorkspace;
  activity?: ActivitySnapshot;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
}

interface Camera { x: number; y: number }

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

export function VillageMap2D({ village, activity, onSelect }: VillageMap2DProps) {
  const layout = useMemo(() => layoutVillage2d(village), [village]);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera }>();
  const maxX = Math.max(0, (layout.width - 32) / 2);
  const maxY = Math.max(0, (layout.height - 24) / 2);
  const records = useMemo(() => new Map(village.projects.flatMap((project) => [
    ...project.features.flatMap((feature) => feature.tasks),
    ...project.tasks,
  ].map((task) => [task.id, { task, project }] as const))), [village]);
  const placements = useMemo(() => new Map(layout.buildings.map((building) => [building.taskId, building])), [layout]);
  const workers = activity?.status === 'live' || activity?.status === 'demo' ? activity.workers : [];

  const moveCamera = (x: number, y: number) => setCamera({ x: clamp(x, maxX), y: clamp(y, maxY) });
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const delta = 3;
    if (event.key === 'ArrowLeft') moveCamera(camera.x - delta, camera.y);
    else if (event.key === 'ArrowRight') moveCamera(camera.x + delta, camera.y);
    else if (event.key === 'ArrowUp') moveCamera(camera.x, camera.y - delta);
    else if (event.key === 'ArrowDown') moveCamera(camera.x, camera.y + delta);
    else return;
    event.preventDefault();
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    moveCamera(
      drag.camera.x - (event.clientX - drag.x) / TILE_SIZE,
      drag.camera.y - (event.clientY - drag.y) / TILE_SIZE,
    );
  };
  const stopDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
  };
  const onWheel = (event: WheelEvent<HTMLElement>) => {
    moveCamera(camera.x + event.deltaX / 80, camera.y + event.deltaY / 80);
  };
  const worldStyle: CSSProperties = {
    width: layout.width * TILE_SIZE,
    height: layout.height * TILE_SIZE,
    transform: `translate(calc(-50% - ${camera.x * TILE_SIZE}px), calc(-50% - ${camera.y * TILE_SIZE}px)) scale(1.2)`,
  };

  return (
    <section
      className="village-map2d"
      data-testid="village-map-2d"
      data-building-count={layout.buildings.length}
      data-worker-count={workers.length}
      data-world-width={layout.width}
      data-world-height={layout.height}
      data-camera-x={Number(camera.x.toFixed(2))}
      data-camera-y={Number(camera.y.toFixed(2))}
      aria-label={`${village.name} pixel village`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onWheel={onWheel}
    >
      <div className="pixel-world" style={worldStyle}>
        <PixelTerrain layout={layout} />
        {layout.buildings.map((placement) => {
          const record = records.get(placement.taskId);
          if (!record) return null;
          return <span key={placement.taskId} className="pixel-building-plot" style={{ left: placement.x * TILE_SIZE, top: placement.y * TILE_SIZE }}>
            <PixelBuilding task={record.task} project={record.project} variant={placement.variant} onSelect={onSelect} />
          </span>;
        })}
        {workers.map((worker, index) => {
          const placement = worker.attachedTaskId ? placements.get(worker.attachedTaskId) : undefined;
          const x = placement ? placement.x + 5 : layout.entrance.x + index * 2;
          const y = placement ? placement.y + 5 : layout.entrance.y;
          return <span key={worker.id} className="pixel-worker-plot" style={{ left: x * TILE_SIZE, top: y * TILE_SIZE }}><PixelWorker worker={worker} /></span>;
        })}
      </div>
      <button type="button" className="map-reset" onClick={() => setCamera({ x: 0, y: 0 })}>Reset village view</button>
      <span className="map-hint" aria-hidden="true">Drag or use arrow keys to explore</span>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import type { DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot, Worker } from '../../shared/activity.js';
import { PixelBuilding } from './PixelBuilding.js';
import { PixelTerrain, TILE_SIZE } from './PixelTerrain.js';
import { PixelWorker } from './PixelWorker.js';
import { layoutVillage2d } from './villageLayout2d.js';

interface VillageMap2DProps {
  village: DerivedWorkspace;
  activity?: ActivitySnapshot;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
  onSelectWorker?: (worker: Worker, trigger: HTMLButtonElement) => void;
}

interface Camera { x: number; y: number }

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

export function fitVillageScale(width: number, height: number, tilesWide: number, tilesHigh: number): number {
  return Math.max(0.15, Math.min(1.2, (width - 40) / (tilesWide * TILE_SIZE), (height - 100) / (tilesHigh * TILE_SIZE)));
}

export function VillageMap2D({ village, activity, onSelect, onSelectWorker }: VillageMap2DProps) {
  const layout = useMemo(() => layoutVillage2d(village), [village]);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const viewport = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(0.65);
  const observed = Boolean(village.observation);
  useEffect(() => {
    if (!observed || !viewport.current || typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(([entry]) => {
      if (entry) setScale(fitVillageScale(entry.contentRect.width, entry.contentRect.height, layout.width, layout.height));
    });
    resize.observe(viewport.current);
    return () => resize.disconnect();
  }, [observed, layout.width, layout.height]);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera }>();
  const maxX = Math.max(0, (layout.width - 32) / 2);
  const maxY = Math.max(0, (layout.height - 24) / 2);
  const records = useMemo(() => new Map(village.projects.flatMap((project) => [
    ...project.features.flatMap((feature) => feature.tasks),
    ...project.tasks,
  ].map((task) => [task.id, { task, project }] as const))), [village]);
  const placements = useMemo(() => new Map(layout.buildings.map((building) => [building.taskId, building])), [layout]);
  const workers = activity?.status === 'live' || activity?.status === 'demo' ? activity.workers : [];
  const leadCount = workers.filter((worker) => worker.role === 'lead').length;
  const helperCount = workers.filter((worker) => worker.role === 'helper').length;
  const helpersByParent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const worker of workers) {
      if (worker.role === 'helper' && worker.parentId) counts.set(worker.parentId, (counts.get(worker.parentId) ?? 0) + 1);
    }
    return counts;
  }, [workers]);
  const workersById = useMemo(() => new Map(workers.map((worker) => [worker.id, worker])), [workers]);

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
    if ((event.target as HTMLElement).closest('button')) return;
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
    transform: `translate(calc(-50% - ${camera.x * TILE_SIZE}px), calc(-50% - ${camera.y * TILE_SIZE}px)) scale(${observed ? scale : 1.2})`,
  };

  return (
    <section
      ref={viewport}
      className="village-map2d"
      data-testid="village-map-2d"
      data-building-count={layout.buildings.length}
      data-worker-count={workers.length}
      data-lead-count={leadCount}
      data-helper-count={helperCount}
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
          const parent = worker.role === 'helper' && worker.parentId ? workersById.get(worker.parentId) : undefined;
          const attachedTaskId = parent?.attachedTaskId ?? worker.attachedTaskId;
          const placement = attachedTaskId ? placements.get(attachedTaskId) : undefined;
          const x = placement ? placement.x + 8 + (index % 2) * 2 : layout.entrance.x + index * 2;
          const y = placement ? placement.y + 2 + (index % 3) * 2 : layout.entrance.y;
          return <span key={worker.id} className="pixel-worker-plot" style={{ left: x * TILE_SIZE, top: y * TILE_SIZE }}><PixelWorker worker={worker} helperCount={helpersByParent.get(worker.id)} onSelect={onSelectWorker} /></span>;
        })}
      </div>
      <button type="button" className="map-reset" onClick={() => setCamera({ x: 0, y: 0 })}>Reset village view</button>
      <span className="map-hint" aria-hidden="true">Drag or use arrow keys to explore</span>
    </section>
  );
}

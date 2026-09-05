import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import type { DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot, Worker } from '../../shared/activity.js';
import { PixelBuilding } from './PixelBuilding.js';
import { PixelTerrain, TILE_SIZE } from './PixelTerrain.js';
import { PixelWorker } from './PixelWorker.js';
import { layoutVillage2d } from './villageLayout2d.js';
import { translate, type Language } from '../language.js';
import { PixelAvatar, type AvatarAppearance } from './PixelAvatar.js';
import { navigationFor, type TilePoint } from './villagePathfinding.js';
import { useVillagePlayer } from './useVillagePlayer.js';

interface VillageMap2DProps {
  language?: Language;
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

export function VillageMap2D({ village, activity, onSelect, onSelectWorker, language = 'en' }: VillageMap2DProps) {
  const layout = useMemo(() => layoutVillage2d(village), [village]);
  // Polling creates new workspace objects. Only changed geometry may interrupt a walk.
  const navigationKey = JSON.stringify([layout.width, layout.height, layout.obstacles, layout.buildings.map(({ x, y }) => [x, y]), layout.landmarks]);
  const navigation = useMemo(() => navigationFor(layout), [navigationKey]);
  const player = useVillagePlayer(navigation, layout.entrance);
  const [visitMode, setVisitMode] = useState(false);
  const [appearance, setAppearance] = useState<AvatarAppearance>('fern');
  const [travelStatus, setTravelStatus] = useState<'idle' | 'walking' | 'arrived' | 'stopped' | 'blocked'>('idle');
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const pointerActivation = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
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
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera; moved: boolean }>();
  const maxX = Math.max(0, (layout.width - 32) / 2);
  const maxY = Math.max(0, (layout.height - 24) / 2);
  const records = useMemo(() => new Map(village.projects.flatMap((project) => [
    ...project.features.flatMap((feature) => feature.tasks),
    ...project.tasks,
  ].map((task) => [task.id, { task, project }] as const))), [village]);
  const placements = useMemo(() => new Map(layout.buildings.map((building) => [building.taskId, building])), [layout]);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const workers = useMemo(() => activity?.status === 'live' || activity?.status === 'demo' ? activity.workers : [], [activity]);
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

  const requestMove = useCallback((destination: TilePoint, afterArrival?: () => void) => {
    setTravelStatus('walking');
    const accepted = player.move(destination, () => { setTravelStatus('arrived'); afterArrival?.(); });
    if (!accepted) setTravelStatus('blocked');
  }, [player.move]);
  const selectBuilding = useCallback((task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => {
    // Native keyboard and assistive activations have click detail 0. They open immediately.
    if (!visitMode || !pointerActivation.current) { player.stop(); onSelectRef.current(task, trigger, project); return; }
    const placement = placements.get(task.id);
    if (!placement) return;
    requestMove(placement.door ?? { x: placement.x + 3, y: placement.y + 6 }, () => {
      const current = recordsRef.current.get(task.id);
      if (current && trigger.isConnected) onSelectRef.current(current.task, trigger, current.project);
    });
  }, [visitMode, placements, requestMove, player.stop]);
  const stopTravel = () => { player.stop(); setTravelStatus('stopped'); };

  const moveCamera = (x: number, y: number) => setCamera({ x: clamp(x, maxX), y: clamp(y, maxY) });
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && visitMode) { stopTravel(); event.preventDefault(); return; }
    if (event.target !== event.currentTarget) return;
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (visitMode && direction) {
      requestMove({ x: Math.round(player.positionRef.current.x) + direction[0]!, y: Math.round(player.positionRef.current.y) + direction[1]! });
      event.preventDefault();
      return;
    }
    const delta = 3;
    if (event.key === 'ArrowLeft') moveCamera(camera.x - delta, camera.y);
    else if (event.key === 'ArrowRight') moveCamera(camera.x + delta, camera.y);
    else if (event.key === 'ArrowUp') moveCamera(camera.x, camera.y - delta);
    else if (event.key === 'ArrowDown') moveCamera(camera.x, camera.y + delta);
    else return;
    event.preventDefault();
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, select, label, input')) return;
    if (!event.isPrimary && event.isPrimary !== undefined) return;
    if (event.button !== undefined && event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 6 && !drag.moved) return;
    drag.moved = true;
    setDragging(true);
    moveCamera(
      drag.camera.x - (event.clientX - drag.x) / TILE_SIZE,
      drag.camera.y - (event.clientY - drag.y) / TILE_SIZE,
    );
  };
  const stopDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    setDragging(false);
    if (event.type === 'pointercancel' || drag.moved || !visitMode || !world.current) return;
    const bounds = world.current.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    requestMove({ x: Math.floor((event.clientX - bounds.left) / bounds.width * layout.width), y: Math.floor((event.clientY - bounds.top) / bounds.height * layout.height) });
  };
  const onWheel = (event: WheelEvent<HTMLElement>) => {
    moveCamera(camera.x + event.deltaX / 80, camera.y + event.deltaY / 80);
  };
  const worldStyle: CSSProperties = {
    width: layout.width * TILE_SIZE,
    height: layout.height * TILE_SIZE,
    transform: `translate(calc(-50% - ${camera.x * TILE_SIZE}px), calc(-50% - ${camera.y * TILE_SIZE}px)) scale(${observed ? scale : 1.2})`,
  };
  // Animation updates only the avatar. Reuse the full terrain and building tree between frames.
  const scenery = useMemo(() => <>
    <PixelTerrain layout={layout} />
    {layout.buildings.map((placement) => {
      const record = records.get(placement.taskId);
      if (!record) return null;
      return <span key={placement.taskId} className="pixel-building-plot" style={{ left: placement.x * TILE_SIZE, top: placement.y * TILE_SIZE }}>
        <PixelBuilding language={language} task={record.task} project={record.project} variant={placement.variant} onSelect={selectBuilding} />
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
  </>, [layout, records, language, selectBuilding, workers, workersById, placements, helpersByParent, onSelectWorker]);

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
      data-visit-mode={visitMode}
      data-dragging={dragging}
      data-player-x={Number(player.position.x.toFixed(2))}
      data-player-y={Number(player.position.y.toFixed(2))}
      data-player-walking={player.walking}
      aria-label={translate(language, 'Village pixel {name}', { name: village.name })}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onWheel={onWheel}
      onClickCapture={(event) => { pointerActivation.current = event.detail > 0; }}
    >
      <div ref={world} className="pixel-world" style={worldStyle}>
        {scenery}
        <PixelAvatar position={player.position} direction={player.direction} appearance={appearance} walking={player.walking} label={translate(language, 'Vous')} />
      </div>
      <div className="map-visit-controls">
        <button type="button" aria-pressed={visitMode} onClick={() => { player.stop(); setVisitMode(!visitMode); setTravelStatus('idle'); }}>{translate(language, visitMode ? 'Quitter la visite' : 'Visiter le village')}</button>
        {visitMode && <>
          <label>{translate(language, 'Apparence')}<select aria-label={translate(language, 'Apparence de votre avatar')} value={appearance} onChange={(event) => setAppearance(event.target.value as AvatarAppearance)}>
            <option value="fern">{translate(language, 'Fougère')}</option><option value="sun">{translate(language, 'Soleil')}</option><option value="iris">{translate(language, 'Iris')}</option>
          </select></label>
          {player.walking && <button type="button" onClick={stopTravel}>{translate(language, 'Arrêter')}</button>}
        </>}
      </div>
      <p className="map-visit-status" role="status" aria-live="polite">{visitMode ? translate(language, travelStatus === 'blocked' ? 'Destination inaccessible.' : travelStatus === 'stopped' ? 'Déplacement arrêté.' : travelStatus === 'arrived' ? 'Vous êtes arrivé.' : 'Cliquer au sol pour marcher, sur une maison pour la visiter.') : translate(language, 'Cliquer sur une maison pour ouvrir son bilan.')}</p>
      <button type="button" className="map-reset" onClick={() => setCamera({ x: 0, y: 0 })}>{translate(language, 'Recentrer le village')}</button>
      <span className="map-hint" aria-hidden="true">{translate(language, visitMode ? 'Flèches : marcher · Échap : arrêter · Glisser : caméra' : 'Glisser ou utiliser les flèches pour explorer')}</span>
    </section>
  );
}

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
import { VillageAnimals } from './VillageAnimals.js';

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
  const [appearance, setAppearance] = useState<AvatarAppearance>('fern');
  const [travelStatus, setTravelStatus] = useState<'idle' | 'walking' | 'arrived' | 'stopped' | 'blocked'>('idle');
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLElement>(null);
  const world = useRef<HTMLDivElement>(null);
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
  const workers = useMemo(() => !activity || activity.status === 'absent' ? [] : [...new Map(activity.workers.map((worker) => [worker.id, worker])).values()], [activity]);
  const leadCount = workers.filter((worker) => worker.role === 'lead').length;
  const helperCount = workers.filter((worker) => worker.role === 'helper').length;
  const confirmedHelperCount = workers.filter((worker) => worker.role === 'helper' && worker.state === 'working' && worker.activityEvidence?.level === 'confirmed').length;
  const helpersByParent = useMemo(() => {
    const counts = new Map<string, { total: number; confirmed: number }>();
    for (const worker of workers) {
      if (worker.role !== 'helper' || !worker.parentId) continue;
      const count = counts.get(worker.parentId) ?? { total: 0, confirmed: 0 };
      count.total++;
      if (worker.state === 'working' && worker.activityEvidence?.level === 'confirmed') count.confirmed++;
      counts.set(worker.parentId, count);
    }
    return counts;
  }, [workers]);
  const workersById = useMemo(() => new Map(workers.map((worker) => [worker.id, worker])), [workers]);
  const workerPlots = useMemo(() => {
    const groups = new Map<string, Worker[]>();
    for (const worker of workers) {
      const parent = worker.role === 'helper' && worker.parentId ? workersById.get(worker.parentId) : undefined;
      const taskId = parent?.attachedTaskId ?? worker.attachedTaskId ?? '';
      const group = groups.get(taskId) ?? [];
      group.push(worker);
      groups.set(taskId, group);
    }
    return [...groups].flatMap(([taskId, group]) => {
      // Keep crowds readable. Badges and data counts include every observation, not just these sprites.
      const lead = group.find((worker) => worker.role === 'lead');
      const helpers = group.filter((worker) => worker.role === 'helper').sort((a, b) => Number(b.activityEvidence?.level === 'confirmed' && b.state === 'working') - Number(a.activityEvidence?.level === 'confirmed' && a.state === 'working'));
      const visible = [...new Map([...(lead ? [lead] : []), ...helpers, ...group].map((worker) => [worker.id, worker])).values()].slice(0, 5);
      return visible.map((worker, slot) => ({ worker, slot, placement: placements.get(taskId) }));
    });
  }, [workers, workersById, placements]);

  const requestMove = useCallback((destination: TilePoint) => {
    setTravelStatus('walking');
    const accepted = player.move(destination, () => setTravelStatus('arrived'));
    if (!accepted) setTravelStatus('blocked');
  }, [player.move]);
  const selectBuilding = useCallback((task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => {
    player.stop();
    setTravelStatus('idle');
    onSelectRef.current(task, trigger, project);
  }, [player.stop]);
  const stopTravel = () => { player.stop(); setTravelStatus('stopped'); };

  const moveCamera = (x: number, y: number) => setCamera({ x: clamp(x, maxX), y: clamp(y, maxY) });
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('select, input, textarea, [contenteditable="true"]')) return;
    if (event.key === 'Escape') { stopTravel(); event.preventDefault(); return; }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!event.shiftKey && direction) {
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
    event.currentTarget.focus({ preventScroll: true });
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
    if (event.type === 'pointercancel' || drag.moved || !world.current) return;
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
    <VillageAnimals layout={layout} navigation={navigation} language={language} />
    {layout.buildings.map((placement) => {
      const record = records.get(placement.taskId);
      if (!record) return null;
      return <span key={placement.taskId} className="pixel-building-plot" style={{ left: placement.x * TILE_SIZE, top: placement.y * TILE_SIZE }}>
        <PixelBuilding language={language} task={record.task} project={record.project} variant={placement.variant} onSelect={selectBuilding} />
      </span>;
    })}
    {workerPlots.map(({ worker, slot, placement }) => {
      const x = placement ? placement.x + 8 + (slot % 2) * 2 : layout.entrance.x + slot * 2;
      const y = placement ? placement.y + 2 + Math.floor(slot / 2) * 2 : layout.entrance.y;
      const counts = helpersByParent.get(worker.id);
      return <span key={worker.id} className="pixel-worker-plot" style={{ left: x * TILE_SIZE, top: y * TILE_SIZE }}><PixelWorker language={language} worker={worker} helperCount={counts?.total} confirmedHelperCount={counts?.confirmed} onSelect={onSelectWorker} /></span>;
    })}
  </>, [layout, navigation, records, language, selectBuilding, workerPlots, helpersByParent, onSelectWorker]);

  return (
    <section
      ref={viewport}
      className="village-map2d"
      data-testid="village-map-2d"
      data-building-count={layout.buildings.length}
      data-worker-count={workers.length}
      data-lead-count={leadCount}
      data-helper-count={helperCount}
      data-confirmed-helper-count={confirmedHelperCount}
      data-worker-sprite-count={workerPlots.length}
      data-world-width={layout.width}
      data-world-height={layout.height}
      data-camera-x={Number(camera.x.toFixed(2))}
      data-camera-y={Number(camera.y.toFixed(2))}
      data-navigation="direct"
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
    >
      <div ref={world} className="pixel-world" style={worldStyle}>
        {scenery}
        <PixelAvatar position={player.position} direction={player.direction} appearance={appearance} walking={player.walking} label={translate(language, 'Vous')} />
      </div>
      <div className="map-visit-controls">
          <label>{translate(language, 'Apparence')}<select aria-label={translate(language, 'Apparence de votre avatar')} value={appearance} onChange={(event) => setAppearance(event.target.value as AvatarAppearance)}>
            <option value="fern">{translate(language, 'Fougère')}</option><option value="sun">{translate(language, 'Soleil')}</option><option value="iris">{translate(language, 'Iris')}</option>
          </select></label>
          {player.walking && <button type="button" onClick={stopTravel}>{translate(language, 'Arrêter')}</button>}
      </div>
      <p className="map-visit-status" role="status" aria-live="polite">{translate(language, travelStatus === 'blocked' ? 'Destination inaccessible.' : travelStatus === 'stopped' ? 'Déplacement arrêté.' : travelStatus === 'arrived' ? 'Vous êtes arrivé.' : 'Cliquer au sol pour marcher, sur une maison pour ouvrir son bilan.')}</p>
      <button type="button" className="map-reset" onClick={() => setCamera({ x: 0, y: 0 })}>{translate(language, 'Recentrer le village')}</button>
      <span className="map-hint" aria-hidden="true">{translate(language, 'Flèches : marcher · Maj+flèches : caméra · Échap : arrêter')}</span>
    </section>
  );
}

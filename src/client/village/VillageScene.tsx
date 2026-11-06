import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import type { BoardSnapshot } from '../../shared/board.js';
import { buildBoardView, indexProjects, sessionPresence } from '../../shared/boardView.js';
import type { SessionEntity } from '../../shared/projector.js';
import type { Translate } from '../board/format.js';
import type { Language } from '../language.js';
import { Terrain } from './Terrain.js';
import { VillageAgent } from './VillageAgent.js';
import { VillageBuilding } from './VillageBuilding.js';
import { layoutVillage } from './layout.js';

const TILE = 16;

interface Camera { x: number; y: number }
function clamp(value: number, limit: number): number { return Math.min(limit, Math.max(-limit, value)); }

interface Props {
  snapshot: BoardSnapshot;
  now: number;
  t: Translate;
  language: Language;
  onSelectProject: (projectId: string) => void;
  onSelectAgent: (sessionId: string) => void;
}

export function VillageScene({ snapshot, now, t, language, onSelectProject, onSelectAgent }: Props) {
  const view = useMemo(() => buildBoardView(snapshot, now), [snapshot, now]);
  const rows = useMemo(() => [...view.rows].sort((a, b) => a.id.localeCompare(b.id)), [view.rows]);
  const sessions: SessionEntity[] = useMemo(
    () => {
      const index = indexProjects(snapshot);
      return [...[...index.projects.values()].flatMap((project) => project.sessions.map((session) => ({ ...session, projectId: project.id,
        state: sessionPresence(session, now).state }))), ...index.unmatched.map((session) => ({ ...session, projectId: undefined,
        state: sessionPresence(session, now).state }))];
    },
    [snapshot, now],
  );
  const layout = useMemo(() => layoutVillage(rows, sessions), [rows, sessions]);
  const buildingsByProject = useMemo(
    () => new Map(layout.buildings.map((b) => [b.projectId, b])),
    [layout.buildings],
  );

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const map = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight - 80 });
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const element = map.current;
    if (!element) return;
    const measure = () => setViewport({ width: element.clientWidth || window.innerWidth, height: element.clientHeight || window.innerHeight - 80 });
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const fit = Math.min(1.2, (viewport.width - 48) / (layout.width * TILE), (viewport.height - 88) / (layout.height * TILE));
  const scale = Math.max(0.05, fit) * zoom;
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera }>();
  const maxX = Math.max(0, (layout.width - 32) / 2);
  const maxY = Math.max(0, (layout.height - 24) / 2);

  const moveCamera = (x: number, y: number) => setCamera({ x: clamp(x, maxX), y: clamp(y, maxY) });
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const d = 3;
    if (e.key === 'ArrowLeft') moveCamera(camera.x - d, camera.y);
    else if (e.key === 'ArrowRight') moveCamera(camera.x + d, camera.y);
    else if (e.key === 'ArrowUp') moveCamera(camera.x, camera.y - d);
    else if (e.key === 'ArrowDown') moveCamera(camera.x, camera.y + d);
    else return;
    e.preventDefault();
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, camera };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    moveCamera(drag.camera.x - (e.clientX - drag.x) / (TILE * scale), drag.camera.y - (e.clientY - drag.y) / (TILE * scale));
  };
  const stopDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = undefined;
  };
  const onWheel = (e: WheelEvent<HTMLElement>) => {
    moveCamera(camera.x + e.deltaX / 80, camera.y + e.deltaY / 80);
  };
  const worldStyle: CSSProperties = {
    '--scene-scale': scale,
    width: layout.width * TILE,
    height: layout.height * TILE,
    transform: `translate(calc(-50% - ${camera.x * TILE * scale}px), calc(-50% - ${camera.y * TILE * scale}px)) scale(${scale})`,
  } as CSSProperties;

  return (
    <section
      ref={map}
      className="village-map"
      data-testid="village-map"
      data-building-count={layout.buildings.length}
      data-agent-count={layout.agents.length}
      aria-label={t('Village des opérations')}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onWheel={onWheel}
    >
      <div className="pixel-world" style={worldStyle}>
        <Terrain layout={layout} />
        {rows.map((row) => {
          const b = buildingsByProject.get(row.id);
          if (!b) return null;
          return <span key={row.id} className="pixel-building-plot" style={{ left: b.x * TILE, top: b.y * TILE }}>
            <VillageBuilding row={row} t={t} language={language} onSelect={onSelectProject} />
          </span>;
        })}
        {layout.agents.map((agent) => (
          <span key={agent.sessionId} className="pixel-agent-plot" style={{ left: agent.x * TILE, top: agent.y * TILE }}>
            <VillageAgent agent={agent} t={t} onSelect={onSelectAgent} />
          </span>
        ))}
      </div>
      <div className="map-controls">
        <button type="button" className="map-reset" onClick={() => { setCamera({ x: 0, y: 0 }); setZoom(1); }}>{t('Recentrer')}</button>
        <button type="button" aria-label="Zoom −" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value / 1.5))}>−</button>
        <button type="button" aria-label="Zoom +" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value * 1.5))}>+</button>
      </div>
      <span className="map-hint" aria-hidden="true">{t('Glisser ou flèches pour explorer')}</span>
    </section>
  );
}

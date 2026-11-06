import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import type { BoardSnapshot } from '../../shared/board.js';
import { buildBoardView, indexProjects } from '../../shared/boardView.js';
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
  const rows = view.rows;
  const sessions: SessionEntity[] = useMemo(
    () => Object.values(snapshot.state.sessions),
    [snapshot.state.sessions],
  );
  const layout = useMemo(() => layoutVillage(rows, sessions), [rows, sessions]);
  const buildingsByProject = useMemo(
    () => new Map(layout.buildings.map((b) => [b.projectId, b])),
    [layout.buildings],
  );

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
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
    moveCamera(drag.camera.x - (e.clientX - drag.x) / TILE, drag.camera.y - (e.clientY - drag.y) / TILE);
  };
  const stopDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = undefined;
  };
  const onWheel = (e: WheelEvent<HTMLElement>) => {
    moveCamera(camera.x + e.deltaX / 80, camera.y + e.deltaY / 80);
  };
  const worldStyle: CSSProperties = {
    width: layout.width * TILE,
    height: layout.height * TILE,
    transform: `translate(calc(-50% - ${camera.x * TILE}px), calc(-50% - ${camera.y * TILE}px)) scale(1.2)`,
  };

  return (
    <section
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
      <button type="button" className="map-reset" onClick={() => setCamera({ x: 0, y: 0 })}>{t('Recentrer')}</button>
      <span className="map-hint" aria-hidden="true">{t('Glisser ou flèches pour explorer')}</span>
    </section>
  );
}

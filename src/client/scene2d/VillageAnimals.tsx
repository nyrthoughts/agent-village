import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { translate, type Language } from '../language.js';
import { TILE_SIZE } from './PixelTerrain.js';
import type { VillageLayout2d } from './types.js';
import { canWalk, type TilePoint, type VillageNavigation } from './villagePathfinding.js';
import './animals.css';

interface AnimalSpot extends TilePoint { travel: number }
type AnimalKind = 'moss-capybara' | 'copper-otter';

function freePatrol(layout: VillageLayout2d, navigation: VillageNavigation, desired: TilePoint): AnimalSpot | undefined {
  let best: AnimalSpot | undefined;
  let distance = Infinity;
  for (let y = 0; y < layout.height - 1; y++) for (let x = 0; x < layout.width - 4; x++) {
    const candidate = Math.abs(x - desired.x) + Math.abs(y - desired.y);
    if (candidate >= distance) continue;
    // Three-tile sprite, two-tile stroll. Also reserve the tall roof area above each house.
    const tiles = Array.from({ length: 10 }, (_, index) => ({ x: x + index % 5, y: y + Math.floor(index / 5) }));
    if (tiles.some((tile) => !canWalk(navigation, tile) || layout.buildings.some((house) => tile.x >= house.x && tile.x < house.x + 7 && tile.y >= house.y - 2 && tile.y < house.y + 6))) continue;
    best = { x, y, travel: 2 };
    distance = candidate;
  }
  return best;
}

function MossCapybara() {
  return <svg viewBox="0 0 64 40" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#314933" opacity=".24" d="M7 32h48v5H7z" />
    <path fill="#594737" d="M13 13h25v-3h15v4h6v17h-7v7h-8v-6H25v6h-8v-7H9V18h4z" />
    <path fill="#bc9662" d="M15 16h23v-3h13v5h6v10H45v3H17v-4h-5v-8h3z" />
    <path fill="#d4b77e" d="M41 19h13v4h5v5H45v-3h-4zM18 23h17v6H18z" />
    <path fill="#92704e" d="M39 8h7v8h-7zM17 30h7v6h-7zM44 30h7v6h-7z" />
    <path fill="#293c30" d="M48 17h3v3h-3zM56 24h3v2h-3z" />
    <path fill="#537d40" d="M13 13h4V8h7v3h5V7h7v6h5v5H13z" />
    <path fill="#8cb060" d="M17 10h5v4h-5zM29 9h5v5h-5zM23 14h5v4h-5z" />
    <path fill="#cc895f" d="M27 5h4v4h-4z" />
  </svg>;
}

function CopperOtter() {
  return <svg viewBox="0 0 64 40" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#314933" opacity=".24" d="M6 32h51v4H6z" />
    <path fill="#315745" d="M1 16h7v4h7v4h8v7H12v-4H5v-4H1z" />
    <path fill="#74a06b" d="M3 17h5v5h7v4h7v3H13v-4H6v-4H3z" />
    <path fill="#624635" d="M22 21h15v-7h6v-4h11v4h6v14h-5v7h-7v-4H34v5h-8v-4h-9v-6h5z" />
    <path fill="#b97546" d="M24 23h15v-7h6v-3h7v4h6v9h-8v4H27v-3h-7v-2h4z" />
    <path fill="#e0b675" d="M40 22h8v4h9v3H45v3H28v-4h12z" />
    <path fill="#865c3c" d="M42 9h5v7h-5zM27 31h6v4h-6zM49 29h5v5h-5z" />
    <path fill="#263f35" d="M50 17h3v3h-3zM57 23h4v3h-4z" />
    <path fill="#e8d4a4" d="M47 23h5v2h-5z" />
  </svg>;
}

function Animal({ kind, spot, motionAllowed, label }: { kind: AnimalKind; spot: AnimalSpot; motionAllowed: boolean; label: string }) {
  const element = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!element.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)));
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const style = { left: spot.x * TILE_SIZE, top: spot.y * TILE_SIZE, '--animal-distance': `${spot.travel * TILE_SIZE}px` } as CSSProperties;
  return <span ref={element} className={`village-animal village-animal--${kind}`} style={style} data-testid={`animal-${kind}`} data-tile-x={spot.x} data-tile-y={spot.y} data-patrol-tiles={spot.travel} data-motion={motionAllowed && inView ? 'running' : 'paused'} role="img" aria-label={label}>
    <span className="village-animal__stroll"><span className="village-animal__body">{kind === 'moss-capybara' ? <MossCapybara /> : <CopperOtter />}</span></span>
  </span>;
}

export function VillageAnimals({ layout, navigation, language }: { layout: VillageLayout2d; navigation: VillageNavigation; language: Language }) {
  const [motionAllowed, setMotionAllowed] = useState(false);
  useEffect(() => {
    const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
    const update = () => setMotionAllowed(!document.hidden && !query?.matches);
    update();
    query?.addEventListener?.('change', update);
    document.addEventListener('visibilitychange', update);
    return () => { query?.removeEventListener?.('change', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const spots = useMemo(() => {
    const pond = layout.landmarks.find((landmark) => landmark.kind === 'pond');
    return [freePatrol(layout, navigation, { x: 19, y: 17 }), freePatrol(layout, navigation, { x: (pond?.x ?? 46) - 7, y: (pond?.y ?? 32) + 1 })];
  }, [layout, navigation]);
  return <>
    {spots[0] && <Animal kind="moss-capybara" spot={spots[0]} motionAllowed={motionAllowed} label={translate(language, 'Capybara mousse — décor')} />}
    {spots[1] && <Animal kind="copper-otter" spot={spots[1]} motionAllowed={motionAllowed} label={translate(language, 'Loutre cuivrée — décor')} />}
  </>;
}

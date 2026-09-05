import type { CSSProperties } from 'react';
import type { PixelObstacle, VillageLayout2d } from './types.js';

export const TILE_SIZE = 16;

const FLOWERS = [[7, 12], [18, 16], [25, 27], [38, 14], [51, 25], [43, 32], [13, 31]] as const;
const ROCKS = [[4, 26], [22, 34], [41, 5], [57, 30]] as const;
const FENCES = [[8, 7], [18, 27], [39, 8], [52, 25]] as const;
const LAMPS = [[26, 18], [37, 23], [29, 32]] as const;

const placed = (x: number, y: number): CSSProperties => ({ left: x * TILE_SIZE, top: y * TILE_SIZE });

interface PixelTerrainProps { layout: VillageLayout2d }

function forestFrame(width: number, height: number): Array<readonly [number, number]> {
  const trees: Array<readonly [number, number]> = [];
  for (let x = 0; x < width - 1; x += 2) {
    trees.push([x, 0], [x + 1, 2]);
    if (x < 27 || x > 36) trees.push([x, height - 4]);
  }
  for (let y = 4; y < height - 5; y += 2) trees.push([0, y], [2, y + 1], [width - 4, y], [width - 2, y + 1]);
  return trees;
}

function forestGroves(obstacles: PixelObstacle[]): Array<readonly [number, number]> {
  return obstacles.filter((obstacle) => obstacle.kind === 'forest').flatMap((grove) => {
    const trees: Array<readonly [number, number]> = [];
    for (let y = grove.y; y <= grove.y + grove.height - 3; y += 2) {
      for (let x = grove.x; x <= grove.x + grove.width - 3; x += 2) trees.push([x, y]);
    }
    return trees;
  });
}

function TreeCrown({ variant }: { variant: number }) {
  return <svg className="pixel-tree__sprite" viewBox="0 0 48 56" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#31533a" opacity=".25" d="M8 44h34v8H8z" />
    <path fill="#684b32" d="M20 32h10v20H20z" /><path fill="#b78848" d="M21 36h4v14h-4z" />
    <path fill="#284e36" d="M16 1h16v5h8v8h5v24h-5v7H8v-7H3V17h5V9h8z" />
    <path fill={variant === 1 ? '#428750' : '#397746'} d="M16 4h15v5h8v9h4v17h-7v7H11v-7H6V18h6V11h4z" />
    <path fill={variant === 1 ? '#73ad5c' : '#629d50'} d="M17 5h13v5h7v9h-9v7H12v7H7V19h6v-8h4z" />
    <path fill="#91bd6b" d="M18 8h10v4H18zM12 17h7v4h-7z" />
    <path fill="#2e643e" d="M35 19h5v15h-7v6H19v-5h9v-7h7z" />
    {variant === 2 && <path fill="#d8b260" d="M30 13h4v4h-4zM11 29h4v4h-4z" />}
  </svg>;
}

export function PixelTerrain({ layout }: PixelTerrainProps) {
  const trees = layout.obstacles ? forestGroves(layout.obstacles) : forestFrame(layout.width, layout.height);
  const decorationFits = ([x, rawY]: readonly [number, number]) => {
    const y = Math.min(rawY, layout.height - 4);
    return ![...(layout.obstacles ?? []), ...layout.paths].some((area) => x + 2 > area.x && x < area.x + area.width && y + 2 > area.y && y < area.y + area.height);
  };
  return (
    <div className="pixel-terrain">
      <div className="pixel-ground" data-testid="pixel-ground" aria-hidden="true" />
      <div className="pixel-meadow pixel-meadow--west" aria-hidden="true" />
      <div className="pixel-meadow pixel-meadow--east" aria-hidden="true" />
      {layout.zones.map((zone) => <div key={zone.projectId} className="pixel-zone" aria-hidden="true" style={{ ...placed(zone.x, zone.y), width: zone.width * TILE_SIZE, height: zone.height * TILE_SIZE }} />)}
      {layout.paths.map((path, index) => <div key={`${path.x}-${path.y}-${index}`} className={`pixel-path pixel-path--${path.kind}`} data-testid="pixel-path" data-path-kind={path.kind} aria-hidden="true" style={{ ...placed(path.x, path.y), width: path.width * TILE_SIZE, height: path.height * TILE_SIZE }} />)}
      {layout.landmarks.map((landmark) => landmark.kind === 'pond'
        ? <div key="pond" className="pixel-pond" data-testid="pixel-pond" aria-hidden="true" style={{ ...placed(landmark.x, landmark.y), width: landmark.width * TILE_SIZE, height: landmark.height * TILE_SIZE }}><i /><i /><i /></div>
        : landmark.kind === 'fountain'
          ? <div key="fountain" className="pixel-fountain" aria-hidden="true" style={{ ...placed(landmark.x, landmark.y), width: landmark.width * TILE_SIZE, height: landmark.height * TILE_SIZE }}><i /><b /></div>
          : <div key="cliff" className="pixel-cliff" data-testid="pixel-cliff" aria-hidden="true" style={{ ...placed(landmark.x, landmark.y), width: landmark.width * TILE_SIZE, height: landmark.height * TILE_SIZE }}><i /><i /><i /></div>)}
      <div className="pixel-forest-frame" data-testid="forest-frame" aria-hidden="true">
        {trees.map(([x, y], index) => <span key={`tree-${index}`} className={`pixel-tree pixel-tree--${index % 3}`} data-testid="pixel-tree" style={placed(x, y)}><TreeCrown variant={index % 3} /></span>)}
      </div>
      {FLOWERS.filter(decorationFits).map(([x, y], index) => <span key={`flower-${index}`} className={`pixel-flower pixel-flower--${index % 3}`} aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))}><i /><i /><i /></span>)}
      {!layout.obstacles && ROCKS.filter(decorationFits).map(([x, y], index) => <span key={`rock-${index}`} className="pixel-rock" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))} />)}
      {!layout.obstacles && FENCES.filter(decorationFits).map(([x, y], index) => <span key={`fence-${index}`} className="pixel-fence" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))}><i /><i /><i /></span>)}
      {!layout.obstacles && LAMPS.filter(decorationFits).map(([x, y], index) => <span key={`lamp-${index}`} className="pixel-lamp" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 4))}><i /></span>)}
      {layout.zones.map((zone) => (
        <span key={`sign-${zone.projectId}`} className="pixel-zone-sign" style={placed(zone.signX, zone.signY)}>
          <i aria-hidden="true" /><strong>{zone.name}</strong>
        </span>
      ))}
      <span className="village-entrance" data-testid="village-entrance" aria-hidden="true" style={placed(layout.entrance.x, layout.entrance.y)}><i /><b /></span>
    </div>
  );
}

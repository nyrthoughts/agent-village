import type { CSSProperties } from 'react';
import type { VillageLayout2d } from './types.js';

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

export function PixelTerrain({ layout }: PixelTerrainProps) {
  const trees = forestFrame(layout.width, layout.height);
  return (
    <div className="pixel-terrain">
      <div className="pixel-ground" data-testid="pixel-ground" aria-hidden="true" />
      {layout.zones.map((zone) => <div key={zone.projectId} className="pixel-zone" aria-hidden="true" style={{ ...placed(zone.x, zone.y), width: zone.width * TILE_SIZE, height: zone.height * TILE_SIZE }} />)}
      {layout.paths.map((path, index) => <div key={`${path.x}-${path.y}-${index}`} className={`pixel-path pixel-path--${path.kind}`} data-testid="pixel-path" data-path-kind={path.kind} aria-hidden="true" style={{ ...placed(path.x, path.y), width: path.width * TILE_SIZE, height: path.height * TILE_SIZE }} />)}
      {layout.landmarks.map((landmark) => landmark.kind === 'pond'
        ? <div key="pond" className="pixel-pond" data-testid="pixel-pond" aria-hidden="true" style={{ ...placed(landmark.x, landmark.y), width: landmark.width * TILE_SIZE, height: landmark.height * TILE_SIZE }}><i /><i /><i /></div>
        : <div key="cliff" className="pixel-cliff" data-testid="pixel-cliff" aria-hidden="true" style={{ ...placed(landmark.x, landmark.y), width: landmark.width * TILE_SIZE, height: landmark.height * TILE_SIZE }}><i /><i /><i /></div>)}
      <div className="pixel-forest-frame" data-testid="forest-frame" aria-hidden="true">
        {trees.map(([x, y], index) => <span key={`tree-${index}`} className={`pixel-tree pixel-tree--${index % 3}`} data-testid="pixel-tree" style={placed(x, y)}><i /><b /></span>)}
      </div>
      {FLOWERS.map(([x, y], index) => <span key={`flower-${index}`} className={`pixel-flower pixel-flower--${index % 3}`} aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))}><i /><i /><i /></span>)}
      {ROCKS.map(([x, y], index) => <span key={`rock-${index}`} className="pixel-rock" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))} />)}
      {FENCES.map(([x, y], index) => <span key={`fence-${index}`} className="pixel-fence" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))}><i /><i /><i /></span>)}
      {LAMPS.map(([x, y], index) => <span key={`lamp-${index}`} className="pixel-lamp" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 4))}><i /></span>)}
      {layout.zones.map((zone) => (
        <span key={`sign-${zone.projectId}`} className="pixel-zone-sign" style={placed(zone.signX, zone.signY)}>
          <i aria-hidden="true" /><strong>{zone.name}</strong>
        </span>
      ))}
      <span className="village-entrance" data-testid="village-entrance" aria-hidden="true" style={placed(layout.entrance.x, layout.entrance.y)}><i /><b /></span>
    </div>
  );
}

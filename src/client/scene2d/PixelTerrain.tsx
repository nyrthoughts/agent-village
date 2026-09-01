import type { CSSProperties } from 'react';
import type { VillageLayout2d } from './types.js';

export const TILE_SIZE = 16;

const TREES = [
  [1, 2], [5, 2], [9, 2], [13, 2], [18, 2], [23, 2], [28, 2],
  [35, 2], [40, 2], [45, 2], [50, 2], [55, 2], [60, 2],
  [1, 12], [1, 20], [1, 28], [1, 36], [59, 12], [60, 20], [60, 28], [59, 36],
  [8, 34], [15, 36], [47, 35], [54, 34],
] as const;
const FLOWERS = [[7, 12], [18, 16], [25, 27], [38, 14], [51, 25], [43, 32], [13, 31]] as const;
const ROCKS = [[4, 26], [22, 34], [41, 5], [57, 30]] as const;

const placed = (x: number, y: number): CSSProperties => ({ left: x * TILE_SIZE, top: y * TILE_SIZE });

interface PixelTerrainProps { layout: VillageLayout2d }

export function PixelTerrain({ layout }: PixelTerrainProps) {
  return (
    <div className="pixel-terrain" aria-hidden="true">
      <div className="pixel-ground" data-testid="pixel-ground" />
      {layout.zones.map((zone) => <div key={zone.projectId} className="pixel-zone" style={{ ...placed(zone.x, zone.y), width: zone.width * TILE_SIZE, height: zone.height * TILE_SIZE }} />)}
      {layout.paths.map((path, index) => <div key={`${path.x}-${path.y}-${index}`} className="pixel-path" data-testid="pixel-path" style={{ ...placed(path.x, path.y), width: path.width * TILE_SIZE, height: path.height * TILE_SIZE }} />)}
      <div className="pixel-pond" data-testid="pixel-pond" style={{ ...placed(27, 27), width: 10 * TILE_SIZE, height: 6 * TILE_SIZE }}><i /><i /><i /></div>
      {TREES.map(([x, y], index) => <span key={`tree-${index}`} className={`pixel-tree pixel-tree--${index % 3}`} data-testid="pixel-tree" style={placed(x, Math.min(y, layout.height - 5))}><i /><b /></span>)}
      {FLOWERS.map(([x, y], index) => <span key={`flower-${index}`} className={`pixel-flower pixel-flower--${index % 3}`} style={placed(x, Math.min(y, layout.height - 3))}><i /><i /><i /></span>)}
      {ROCKS.map(([x, y], index) => <span key={`rock-${index}`} className="pixel-rock" style={placed(x, Math.min(y, layout.height - 3))} />)}
      {layout.zones.map((zone) => (
        <span key={`sign-${zone.projectId}`} className="pixel-zone-sign" style={placed(zone.signX, zone.signY)}>
          <i aria-hidden="true" /><strong>{zone.name}</strong>
        </span>
      ))}
      <span className="village-entrance" data-testid="village-entrance" style={placed(layout.entrance.x, layout.entrance.y)}><i /><b /></span>
    </div>
  );
}

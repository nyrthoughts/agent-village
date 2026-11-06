import type { CSSProperties } from 'react';
import type { VillageLayout } from './types.js';

const TILE = 16;
const FLOWERS = [[7, 12], [18, 16], [25, 27], [38, 14], [51, 25], [43, 32], [13, 31]] as const;
const ROCKS = [[4, 26], [22, 34], [41, 5], [57, 30]] as const;
const FENCES = [[8, 7], [18, 27], [39, 8], [52, 25]] as const;
const LAMPS = [[26, 18], [37, 23], [29, 32]] as const;

const placed = (x: number, y: number): CSSProperties => ({ left: x * TILE, top: y * TILE });

function forestFrame(width: number, height: number): Array<readonly [number, number]> {
  const trees: Array<readonly [number, number]> = [];
  for (let x = 0; x < width - 1; x += 2) {
    trees.push([x, 0], [x + 1, 2]);
    if (x < 27 || x > 36) trees.push([x, height - 4]);
  }
  for (let y = 4; y < height - 5; y += 2) trees.push([0, y], [2, y + 1], [width - 4, y], [width - 2, y + 1]);
  return trees;
}

export function Terrain({ layout }: { layout: VillageLayout }) {
  const trees = forestFrame(layout.width, layout.height);
  return (
    <div className="pixel-terrain">
      <div className="pixel-ground" aria-hidden="true" />
      {layout.zones.map((zone) => <div key={zone.projectId} className="pixel-zone" aria-hidden="true"
        style={{ ...placed(zone.x, zone.y), width: zone.width * TILE, height: zone.height * TILE }} />)}
      {layout.paths.map((path, i) => <div key={`${path.x}-${path.y}-${i}`} className={`pixel-path pixel-path--${path.kind}`}
        aria-hidden="true" style={{ ...placed(path.x, path.y), width: path.width * TILE, height: path.height * TILE }} />)}
      {layout.landmarks.map((lm) => lm.kind === 'pond'
        ? <div key="pond" className="pixel-pond" aria-hidden="true" style={{ ...placed(lm.x, lm.y), width: lm.width * TILE, height: lm.height * TILE }}><i /><i /><i /></div>
        : <div key="cliff" className="pixel-cliff" aria-hidden="true" style={{ ...placed(lm.x, lm.y), width: lm.width * TILE, height: lm.height * TILE }}><i /><i /><i /></div>)}
      <div className="pixel-forest-frame" aria-hidden="true">
        {trees.map(([x, y], i) => <span key={`tree-${i}`} className={`pixel-tree pixel-tree--${i % 3}`} style={placed(x, y)}><i /><b /></span>)}
      </div>
      {FLOWERS.map(([x, y], i) => <span key={`flower-${i}`} className={`pixel-flower pixel-flower--${i % 3}`} aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))}><i /><i /><i /></span>)}
      {ROCKS.map(([x, y], i) => <span key={`rock-${i}`} className="pixel-rock" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))} />)}
      {FENCES.map(([x, y], i) => <span key={`fence-${i}`} className="pixel-fence" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 3))}><i /><i /><i /></span>)}
      {LAMPS.map(([x, y], i) => <span key={`lamp-${i}`} className="pixel-lamp" aria-hidden="true" style={placed(x, Math.min(y, layout.height - 4))}><i /></span>)}
      {layout.zones.map((zone) => (
        <span key={`sign-${zone.projectId}`} className="pixel-zone-sign" style={placed(zone.signX, zone.signY)}>
          <i aria-hidden="true" /><strong>{zone.name}</strong>
        </span>
      ))}
      <span className="village-entrance" aria-hidden="true" style={placed(layout.entrance.x, layout.entrance.y)}><i /><b /></span>
    </div>
  );
}

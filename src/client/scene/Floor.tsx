import type { FloorSpec } from './buildingLayout.js';

interface FloorProps {
  floor: FloorSpec;
  index: number;
}

export function Floor({ floor, index }: FloorProps) {
  const y = 116 - index * 22;
  return (
    <g
      className={`floor floor--${floor.visual}`}
      data-floor-id={floor.id}
      data-visual={floor.visual}
      aria-label={`${floor.title}: ${floor.status.replace('_', ' ')}`}
    >
      <polygon className="floor__left" points={`40,${y} 18,${y - 8} 18,${y + 10} 40,${y + 18}`} />
      <polygon className="floor__right" points={`40,${y} 82,${y - 14} 82,${y + 4} 40,${y + 18}`} />
      <polygon className="floor__top" points={`18,${y - 8} 60,${y - 22} 82,${y - 14} 40,${y}`} />
      {floor.visual === 'frame' && (
        <path className="floor__beam" d={`M22 ${y + 7} L78 ${y - 10} M40 ${y} L40 ${y + 17}`} />
      )}
    </g>
  );
}

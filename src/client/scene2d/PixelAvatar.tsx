import type { CSSProperties } from 'react';
import type { PlayerDirection } from './useVillagePlayer.js';
import type { TilePoint } from './villagePathfinding.js';
import { TILE_SIZE } from './PixelTerrain.js';
import './player.css';

export type AvatarAppearance = 'fern' | 'sun' | 'iris';
interface PixelAvatarProps { position: TilePoint; direction: PlayerDirection; appearance: AvatarAppearance; walking: boolean; label: string }

export function PixelAvatar({ position, direction, appearance, walking, label }: PixelAvatarProps) {
  const style: CSSProperties = { left: (position.x + 0.5) * TILE_SIZE, top: (position.y + 0.5) * TILE_SIZE };
  return <span className={`pixel-avatar pixel-avatar--${appearance}`} style={style} data-testid="village-avatar" data-direction={direction} data-walking={walking} role="img" aria-label={label}>
    <span className="pixel-avatar__shadow" aria-hidden="true" />
    <span className="pixel-avatar__body" aria-hidden="true"><i className="pixel-avatar__hair" /><i className="pixel-avatar__face" /><i className="pixel-avatar__coat" /><i className="pixel-avatar__pack" /><i className="pixel-avatar__legs" /></span>
    <strong aria-hidden="true">{label}</strong>
  </span>;
}

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { VillageLayout2d } from './types.js';
import { PixelTerrain } from './PixelTerrain.js';

afterEach(cleanup);

const layout: VillageLayout2d = {
  width: 64,
  height: 44,
  entrance: { x: 31, y: 40 },
  zones: [
    { projectId: 'atlas', name: 'Atlas', x: 2, y: 6, width: 28, height: 24, signX: 25, signY: 16 },
    { projectId: 'beacon', name: 'Beacon', x: 34, y: 6, width: 28, height: 24, signX: 35, signY: 16 },
  ],
  buildings: [],
  paths: [{ x: 30, y: 24, width: 4, height: 20, kind: 'vertical' }, { x: 12, y: 16, width: 20, height: 3, kind: 'horizontal' }],
  landmarks: [{ kind: 'pond', x: 46, y: 29, width: 13, height: 8 }, { kind: 'cliff', x: 3, y: 28, width: 12, height: 8 }],
};

describe('PixelTerrain', () => {
  it('renders one connected village from original tile families', () => {
    render(<PixelTerrain layout={layout} />);
    expect(screen.getByTestId('pixel-ground')).toBeTruthy();
    expect(screen.getAllByTestId('pixel-path')).toHaveLength(layout.paths.length);
    expect(new Set(screen.getAllByTestId('pixel-path').map((path) => path.getAttribute('data-path-kind'))))
      .toEqual(new Set(['vertical', 'horizontal']));
    expect(screen.getByText('Atlas')).toBeTruthy();
    expect(screen.getByText('Beacon')).toBeTruthy();
    expect(screen.getByTestId('forest-frame').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getAllByTestId('pixel-tree').length).toBeGreaterThanOrEqual(50);
    expect(screen.getByTestId('pixel-pond')).toBeTruthy();
    expect(screen.getByTestId('pixel-cliff')).toBeTruthy();
    expect(screen.getByTestId('village-entrance')).toBeTruthy();
  });
});

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
  paths: [{ x: 30, y: 0, width: 4, height: 44 }, { x: 12, y: 16, width: 20, height: 3 }],
};

describe('PixelTerrain', () => {
  it('renders one connected village from original tile families', () => {
    render(<PixelTerrain layout={layout} />);
    expect(screen.getByTestId('pixel-ground')).toBeTruthy();
    expect(screen.getAllByTestId('pixel-path')).toHaveLength(layout.paths.length);
    expect(screen.getByText('Atlas')).toBeTruthy();
    expect(screen.getByText('Beacon')).toBeTruthy();
    expect(screen.getAllByTestId('pixel-tree').length).toBeGreaterThan(8);
    expect(screen.getByTestId('pixel-pond')).toBeTruthy();
    expect(screen.getByTestId('village-entrance')).toBeTruthy();
  });
});

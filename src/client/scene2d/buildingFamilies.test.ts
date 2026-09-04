import { describe, expect, it } from 'vitest';
import { BUILDING_FAMILIES, buildingFamilyFor } from './buildingFamilies.js';

describe('building families', () => {
  it('offers eight distinct extensible architectural families', () => {
    expect(BUILDING_FAMILIES.map(({ id }) => id)).toEqual([
      'timber_north',
      'courtyard_sun',
      'townhouse_brick',
      'earth_courtyard',
      'mountain_adobe',
      'tropical_stilt',
      'woodland_tile',
      'civic_modern',
    ]);
    expect(new Set(BUILDING_FAMILIES.map(({ roof }) => roof)).size).toBeGreaterThan(3);
  });

  it('assigns a family from the stable task id rather than render order', () => {
    expect(buildingFamilyFor('atlas-contours')).toEqual(buildingFamilyFor('atlas-contours'));
    expect(buildingFamilyFor('atlas-contours')).toBe(BUILDING_FAMILIES[buildingFamilyFor('atlas-contours').index]);
  });
});

import { describe, expect, it } from 'vitest';
import { BUILDING_FAMILIES, buildingFamilyFor } from './buildingFamilies.js';

describe('building families', () => {
  it('offers six culturally inspired original architectural families', () => {
    expect(BUILDING_FAMILIES.map(({ id }) => id)).toEqual([
      'japanese_workshop',
      'moroccan_courtyard',
      'dutch_gable',
      'brazilian_sobrado',
      'greek_terraces',
      'norwegian_storehouse',
    ]);
    expect(new Set(BUILDING_FAMILIES.map(({ roof }) => roof)).size).toBeGreaterThan(3);
  });

  it('assigns a family from the stable task id rather than render order', () => {
    expect(buildingFamilyFor('atlas-contours')).toEqual(buildingFamilyFor('atlas-contours'));
    expect(buildingFamilyFor('atlas-contours')).toBe(BUILDING_FAMILIES[buildingFamilyFor('atlas-contours').index]);
  });
});

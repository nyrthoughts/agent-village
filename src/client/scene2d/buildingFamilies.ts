export type RoofShape = 'gable' | 'flat' | 'stepped' | 'hipped' | 'stilt';

export interface BuildingFamily {
  id: string;
  index: number;
  roof: RoofShape;
  roofColor: string;
  roofLight: string;
  roofDark: string;
  wallColor: string;
  wallLight: string;
  wallDark: string;
  trimColor: string;
}

export const BUILDING_FAMILIES: readonly BuildingFamily[] = [
  { id: 'timber_north', index: 0, roof: 'gable', roofColor: '#4f8db9', roofLight: '#7fb7d4', roofDark: '#315a77', wallColor: '#e4c985', wallLight: '#fff0b4', wallDark: '#a9744b', trimColor: '#64442f' },
  { id: 'courtyard_sun', index: 1, roof: 'flat', roofColor: '#e4a047', roofLight: '#f4c36d', roofDark: '#9b5c2d', wallColor: '#f0d69a', wallLight: '#fff1bf', wallDark: '#c38a55', trimColor: '#76503a' },
  { id: 'townhouse_brick', index: 2, roof: 'stepped', roofColor: '#7c4d56', roofLight: '#b56d72', roofDark: '#4d3443', wallColor: '#c97857', wallLight: '#eaa177', wallDark: '#8c493d', trimColor: '#f2d89d' },
  { id: 'earth_courtyard', index: 3, roof: 'flat', roofColor: '#a76d3d', roofLight: '#d29755', roofDark: '#6e482f', wallColor: '#d9a86c', wallLight: '#f1cb89', wallDark: '#9b6946', trimColor: '#5f4937' },
  { id: 'mountain_adobe', index: 4, roof: 'stepped', roofColor: '#c06f3f', roofLight: '#e69a5f', roofDark: '#81472f', wallColor: '#e4b77d', wallLight: '#f8daa1', wallDark: '#a66f4e', trimColor: '#60483b' },
  { id: 'tropical_stilt', index: 5, roof: 'stilt', roofColor: '#3d8f73', roofLight: '#69b497', roofDark: '#28634f', wallColor: '#e7c77e', wallLight: '#f8e3aa', wallDark: '#9e7749', trimColor: '#5d4934' },
  { id: 'woodland_tile', index: 6, roof: 'hipped', roofColor: '#39736c', roofLight: '#5ca097', roofDark: '#27534e', wallColor: '#d8cf9b', wallLight: '#f3ecc1', wallDark: '#958861', trimColor: '#58483b' },
  { id: 'civic_modern', index: 7, roof: 'flat', roofColor: '#5b718e', roofLight: '#8497ae', roofDark: '#3a4b62', wallColor: '#d5d8cf', wallLight: '#f1f1df', wallDark: '#929b94', trimColor: '#42515a' },
] as const;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildingFamilyFor(taskId: string): BuildingFamily {
  return BUILDING_FAMILIES[stableHash(taskId) % BUILDING_FAMILIES.length]!;
}

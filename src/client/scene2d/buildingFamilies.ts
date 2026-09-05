export type BuildingArchitecture = 'japanese_workshop' | 'moroccan_courtyard' | 'dutch_gable' | 'brazilian_sobrado' | 'greek_terraces' | 'norwegian_storehouse';
export type RoofShape = 'swept' | 'courtyard' | 'stepped' | 'hipped' | 'terraced' | 'stilt';

export interface BuildingFamily {
  id: BuildingArchitecture;
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
  { id: 'japanese_workshop', index: 0, roof: 'swept', roofColor: '#477d78', roofLight: '#76a69b', roofDark: '#2b514f', wallColor: '#e8cf9b', wallLight: '#fff0c5', wallDark: '#bc9469', trimColor: '#624b3b' },
  { id: 'moroccan_courtyard', index: 1, roof: 'courtyard', roofColor: '#dea769', roofLight: '#f9d69a', roofDark: '#a5724e', wallColor: '#ecc48a', wallLight: '#ffe3ae', wallDark: '#bd855d', trimColor: '#785240' },
  { id: 'dutch_gable', index: 2, roof: 'stepped', roofColor: '#ae5b47', roofLight: '#dd8961', roofDark: '#714535', wallColor: '#c47552', wallLight: '#eaaa77', wallDark: '#915740', trimColor: '#f4dfab' },
  { id: 'brazilian_sobrado', index: 3, roof: 'hipped', roofColor: '#c27149', roofLight: '#eda976', roofDark: '#86523e', wallColor: '#72aba3', wallLight: '#a6d0b4', wallDark: '#4d7b77', trimColor: '#f6e4b1' },
  { id: 'greek_terraces', index: 4, roof: 'terraced', roofColor: '#d1ddca', roofLight: '#fff4ce', roofDark: '#8aa5a0', wallColor: '#eee9cc', wallLight: '#fff9de', wallDark: '#b6c4b6', trimColor: '#467c98' },
  { id: 'norwegian_storehouse', index: 5, roof: 'stilt', roofColor: '#668557', roofLight: '#9bae70', roofDark: '#3e6044', wallColor: '#9a6946', wallLight: '#c49059', wallDark: '#674a38', trimColor: '#4c4031' },
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

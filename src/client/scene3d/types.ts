export interface BuildingPlacement {
  taskId: string;
  projectId: string;
  compoundId?: string;
  x: number;
  z: number;
  rotationY: number;
}

export interface DistrictPlacement {
  projectId: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface VillageLayout3d {
  districts: DistrictPlacement[];
  buildings: BuildingPlacement[];
  width: number;
  depth: number;
}

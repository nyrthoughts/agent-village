export interface PixelZone {
  projectId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  signX: number;
  signY: number;
}

export interface PixelBuildingPlacement {
  taskId: string;
  projectId: string;
  compoundId?: string;
  x: number;
  y: number;
  variant: number;
}

export interface PixelPath { x: number; y: number; width: number; height: number }

export interface VillageLayout2d {
  width: number;
  height: number;
  zones: PixelZone[];
  buildings: PixelBuildingPlacement[];
  paths: PixelPath[];
  entrance: { x: number; y: number };
}

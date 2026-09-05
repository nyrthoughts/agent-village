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
  door?: { x: number; y: number };
}

export type PixelPathKind = 'vertical' | 'horizontal' | 'square' | 'spur';

export interface PixelPath { x: number; y: number; width: number; height: number; kind: PixelPathKind }

export interface PixelLandmark {
  kind: 'pond' | 'cliff' | 'fountain';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'building' | 'water' | 'forest' | 'cliff';
}

export interface VillageLayout2d {
  width: number;
  height: number;
  zones: PixelZone[];
  buildings: PixelBuildingPlacement[];
  paths: PixelPath[];
  landmarks: PixelLandmark[];
  entrance: { x: number; y: number };
  obstacles?: PixelObstacle[];
}

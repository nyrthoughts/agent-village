export interface VillageZone {
  projectId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  signX: number;
  signY: number;
}

export interface VillageBuildingPlacement {
  projectId: string;
  x: number;
  y: number;
  variant: number;
}

export type PathKind = 'vertical' | 'horizontal' | 'square' | 'spur';
export interface VillagePath { x: number; y: number; width: number; height: number; kind: PathKind }

export interface VillageLandmark { kind: 'pond' | 'cliff'; x: number; y: number; width: number; height: number }

export interface VillageAgentPlacement {
  sessionId: string;
  projectId?: string;
  x: number;
  y: number;
  tool: string;
  role: string;
  state: string;
  title: string;
}

export interface VillageLayout {
  width: number;
  height: number;
  zones: VillageZone[];
  buildings: VillageBuildingPlacement[];
  paths: VillagePath[];
  landmarks: VillageLandmark[];
  agents: VillageAgentPlacement[];
  entrance: { x: number; y: number };
}

import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { PixelBuildingPlacement, PixelLandmark, PixelObstacle, PixelPath, PixelZone, VillageLayout2d } from './types.js';

const WORLD_WIDTH = 64;
const ZONE_WIDTH = 28;
const ZONE_GAP = 4;
const ZONE_COLUMNS = 2;
const PLOT_COLUMNS = 2;

function projectTasks(project: DerivedWorkspace['projects'][number]) {
  return [
    ...project.features.flatMap((feature) => feature.tasks.map((task) => ({ task, compoundId: feature.id }))),
    ...project.tasks.map((task) => ({ task, compoundId: undefined })),
  ];
}

function zoneHeight(taskCount: number): number {
  const rows = Math.max(1, Math.ceil(taskCount / PLOT_COLUMNS));
  return 24 + Math.max(0, rows - 2) * 7;
}

function observedVillage(village: DerivedWorkspace): VillageLayout2d {
  const positions = [[11, 9], [29, 6], [45, 12], [9, 27], [22, 30], [46, 28]] as const;
  const height = 48 + Math.ceil(Math.max(0, village.projects.length - 6) / 3) * 12;
  const buildings: PixelBuildingPlacement[] = village.projects.map((project, index) => {
    const [x, y] = positions[index] ?? [[9, 22, 47][(index - 6) % 3]!, 43 + Math.floor((index - 6) / 3) * 12 + (index % 2) * 2];
    return { taskId: project.id, projectId: project.id, x, y, variant: index % 3, door: { x: x + 3, y: y + 6 } };
  });
  const paths: PixelPath[] = [
    { x: 27, y: 20, width: 12, height: 8, kind: 'square' },
    { x: 12, y: 21, width: 39, height: 3, kind: 'horizontal' },
    { x: 30, y: 25, width: 4, height: height - 25, kind: 'vertical' },
  ];
  for (const building of buildings) {
    const door = building.door!;
    const laneY = building.y < 20 ? 22 : building.y < 40 ? (building.x > 40 ? 36 : 38) : door.y + 2;
    paths.push(
      { x: door.x - 1, y: Math.min(door.y, laneY), width: 3, height: Math.abs(door.y - laneY) + 2, kind: 'spur' },
      { x: Math.min(door.x, 31), y: laneY, width: Math.abs(door.x - 31) + 3, height: 3, kind: 'horizontal' },
    );
  }
  const landmarks: PixelLandmark[] = [
    { kind: 'pond', x: 45, y: buildings.length > 6 ? 5 : height - 9, width: 14, height: 6 },
    { kind: 'cliff', x: 3, y: 17, width: 7, height: 7 },
    { kind: 'fountain', x: 35, y: 22, width: 3, height: 3 },
  ];
  const obstacles: PixelObstacle[] = [
    { kind: 'forest', x: 0, y: 0, width: 64, height: 5 },
    { kind: 'forest', x: 0, y: 5, width: 5, height: 12 },
    { kind: 'forest', x: 0, y: 24, width: 4, height: height - 24 },
    { kind: 'forest', x: 60, y: 5, width: 4, height: height - 5 },
    { kind: 'forest', x: 4, y: height - 3, width: 24, height: 3 },
    { kind: 'forest', x: 36, y: height - 3, width: 24, height: 3 },
    ...buildings.map(({ x, y }): PixelObstacle => ({ kind: 'building', x, y, width: 7, height: 6 })),
    ...landmarks.map(({ x, y, width, height, kind }): PixelObstacle => ({ x, y, width, height, kind: kind === 'pond' ? 'water' : 'cliff' })),
  ];
  return {
    width: 64, height, buildings, paths, landmarks, obstacles, entrance: { x: 31, y: height - 4 },
    zones: village.projects.map((project, index) => {
      const building = buildings[index]!;
      return { projectId: project.id, name: project.name, x: building.x - 2, y: building.y - 1, width: 11, height: 10, signX: building.x + 3, signY: building.y + 7 };
    }),
  };
}

function projectDistrict(village: DerivedWorkspace): VillageLayout2d {
  const project = village.projects[0]!;
  const tasks = projectTasks(project).map(({ task }) => task).sort((a, b) => {
    if (a.id === project.id) return -1;
    if (b.id === project.id) return 1;
    return a.id.localeCompare(b.id);
  });
  const rows = Math.ceil(Math.max(0, tasks.length - 1) / 3);
  const height = rows ? 44 + (rows - 1) * 14 : 38;
  const buildings: PixelBuildingPlacement[] = tasks.map((task, index) => {
    const x = index === 0 ? 20 : [6, 20, 34][(index - 1) % 3]!;
    const y = index === 0 ? 7 : 25 + Math.floor((index - 1) / 3) * 14;
    return { taskId: task.id, projectId: project.id, x, y, variant: index % 3, door: { x: x + 3, y: y + 6 } };
  });
  const paths: PixelPath[] = [
    { x: 14, y: 17, width: 19, height: 7, kind: 'square' },
    { x: 22, y: 13, width: 3, height: 8, kind: 'spur' },
    { x: 16, y: 20, width: 3, height: height - 20, kind: 'vertical' },
    { x: 30, y: 22, width: 3, height: Math.max(3, height - 29), kind: 'vertical' },
  ];
  for (let row = 0; row < rows; row++) {
    paths.push({ x: 8, y: 34 + row * 14, width: 31, height: 3, kind: 'horizontal' });
  }
  for (const building of buildings.slice(1)) {
    paths.push({ x: building.door!.x - 1, y: building.door!.y, width: 3, height: 6, kind: 'spur' });
  }
  const landmarks: PixelLandmark[] = [
    { kind: 'pond', x: 35, y: 7, width: 8, height: 6 },
    { kind: 'fountain', x: 28, y: 18, width: 3, height: 3 },
  ];
  const obstacles: PixelObstacle[] = [
    { kind: 'forest', x: 0, y: 0, width: 48, height: 4 },
    { kind: 'forest', x: 0, y: 4, width: 4, height: height - 4 },
    { kind: 'forest', x: 44, y: 4, width: 4, height: height - 4 },
    { kind: 'forest', x: 4, y: height - 3, width: 10, height: 3 },
    { kind: 'forest', x: 21, y: height - 3, width: 23, height: 3 },
    ...buildings.map(({ x, y }): PixelObstacle => ({ kind: 'building', x, y, width: 7, height: 6 })),
    ...landmarks.map(({ x, y, width, height, kind }): PixelObstacle => ({ x, y, width, height, kind: kind === 'pond' ? 'water' : 'cliff' })),
  ];
  return {
    width: 48, height, buildings, paths, landmarks, obstacles, entrance: { x: 17, y: height - 4 },
    zones: [{ projectId: project.id, name: project.name, x: 5, y: 5, width: 38, height: height - 10, signX: 23, signY: 15 }],
  };
}

export function layoutVillage2d(village: DerivedWorkspace, district = false): VillageLayout2d {
  if (district && village.projects.length === 1) return projectDistrict(village);
  if (village.observation) return observedVillage(village);
  const rowCount = Math.max(1, Math.ceil(village.projects.length / ZONE_COLUMNS));
  const rowHeights = Array.from({ length: rowCount }, (_, row) => Math.max(
    ...village.projects.slice(row * ZONE_COLUMNS, row * ZONE_COLUMNS + ZONE_COLUMNS)
      .map((project) => zoneHeight(projectTasks(project).length)),
    24,
  ));
  const height = Math.max(44, 12 + rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, rowCount - 1) * 4);
  const zones: PixelZone[] = [];
  const buildings: PixelBuildingPlacement[] = [];
  const paths: PixelPath[] = [
    { x: 29, y: Math.max(24, height - 15), width: 6, height: 15, kind: 'vertical' },
    { x: 24, y: 15, width: 16, height: 14, kind: 'square' },
    { x: 29, y: 8, width: 6, height: 9, kind: 'vertical' },
    { x: 8, y: 18, width: 18, height: 5, kind: 'horizontal' },
    { x: 38, y: 20, width: 18, height: 5, kind: 'horizontal' },
  ];
  const landmarks: PixelLandmark[] = [
    { kind: 'pond', x: 46, y: Math.min(29, height - 12), width: 13, height: 8 },
    { kind: 'cliff', x: 3, y: Math.min(28, height - 13), width: 12, height: 8 },
  ];
  let rowY = 6;

  rowHeights.forEach((rowHeight, row) => {
    const projects = village.projects.slice(row * ZONE_COLUMNS, row * ZONE_COLUMNS + ZONE_COLUMNS);
    projects.forEach((project, column) => {
      const x = 2 + column * (ZONE_WIDTH + ZONE_GAP);
      const zone: PixelZone = {
        projectId: project.id,
        name: project.name,
        x,
        y: rowY,
        width: ZONE_WIDTH,
        height: rowHeight,
        signX: x + (column === 0 ? 23 : 1),
        signY: rowY + 10,
      };
      zones.push(zone);
      projectTasks(project).forEach(({ task, compoundId }, index) => {
        const plotColumn = index % PLOT_COLUMNS;
        const plotRow = Math.floor(index / PLOT_COLUMNS);
        const placement: PixelBuildingPlacement = {
          taskId: task.id,
          projectId: project.id,
          compoundId,
          x: x + 3 + plotColumn * 11,
          y: rowY + 3 + plotRow * 11,
          variant: (index + row * ZONE_COLUMNS + column) % 3,
        };
        buildings.push(placement);
        paths.push({ x: placement.x + 4, y: placement.y + 5, width: 3, height: 7, kind: 'spur' });
      });
    });
    rowY += rowHeight + 4;
  });

  return { width: WORLD_WIDTH, height, zones, buildings, paths, landmarks, entrance: { x: 31, y: height - 4 } };
}

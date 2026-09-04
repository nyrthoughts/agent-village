import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { PixelBuildingPlacement, PixelLandmark, PixelPath, PixelZone, VillageLayout2d } from './types.js';

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

export function layoutVillage2d(village: DerivedWorkspace): VillageLayout2d {
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

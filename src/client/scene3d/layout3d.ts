import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { BuildingPlacement, DistrictPlacement, VillageLayout3d } from './types.js';

const DISTRICT_COLUMNS = 2;
const DISTRICT_WIDTH = 30;
const DISTRICT_GAP = 6;
const PLOT_COLUMNS = 3;
const PLOT_X_GAP = 8;
const PLOT_Z_GAP = 7;
const PLOT_TOP_INSET = 7;

interface ProjectSize {
  width: number;
  depth: number;
}

function projectSize(taskCount: number): ProjectSize {
  const rows = Math.max(1, Math.ceil(taskCount / PLOT_COLUMNS));
  return {
    width: DISTRICT_WIDTH,
    depth: Math.max(20, 10 + rows * PLOT_Z_GAP),
  };
}

export function layoutVillage3d(village: DerivedWorkspace): VillageLayout3d {
  const sizes = village.projects.map((project) => projectSize(
    project.features.reduce((count, feature) => count + feature.tasks.length, 0)
      + project.tasks.length,
  ));
  const rowDepths = Array.from(
    { length: Math.ceil(village.projects.length / DISTRICT_COLUMNS) },
    (_, row) => Math.max(
      ...sizes.slice(row * DISTRICT_COLUMNS, row * DISTRICT_COLUMNS + DISTRICT_COLUMNS)
        .map(({ depth }) => depth),
      0,
    ),
  );
  const totalWidth = village.projects.length <= 1
    ? DISTRICT_WIDTH
    : DISTRICT_WIDTH * DISTRICT_COLUMNS + DISTRICT_GAP;
  const totalDepth = rowDepths.reduce((sum, depth) => sum + depth, 0)
    + Math.max(0, rowDepths.length - 1) * DISTRICT_GAP;
  const districts: DistrictPlacement[] = [];
  const buildings: BuildingPlacement[] = [];
  let rowStart = -totalDepth / 2;

  rowDepths.forEach((rowDepth, row) => {
    const rowProjects = village.projects.slice(
      row * DISTRICT_COLUMNS,
      row * DISTRICT_COLUMNS + DISTRICT_COLUMNS,
    );
    rowProjects.forEach((project, column) => {
      const projectIndex = row * DISTRICT_COLUMNS + column;
      const size = sizes[projectIndex]!;
      const rowWidth = rowProjects.length * DISTRICT_WIDTH
        + Math.max(0, rowProjects.length - 1) * DISTRICT_GAP;
      const districtX = -rowWidth / 2 + DISTRICT_WIDTH / 2
        + column * (DISTRICT_WIDTH + DISTRICT_GAP);
      const districtZ = rowStart + rowDepth / 2;
      districts.push({
        projectId: project.id,
        x: districtX,
        z: districtZ,
        width: size.width,
        depth: size.depth,
      });

      const tasks = [
        ...project.features.flatMap((feature) => feature.tasks.map((task) => ({
          task,
          compoundId: feature.id,
        }))),
        ...project.tasks.map((task) => ({ task, compoundId: undefined })),
      ];
      tasks.forEach(({ task, compoundId }, index) => {
        const plotColumn = index % PLOT_COLUMNS;
        const plotRow = Math.floor(index / PLOT_COLUMNS);
        buildings.push({
          taskId: task.id,
          projectId: project.id,
          compoundId,
          x: districtX - DISTRICT_WIDTH / 2 + 7 + plotColumn * PLOT_X_GAP,
          z: districtZ - size.depth / 2 + PLOT_TOP_INSET + plotRow * PLOT_Z_GAP,
          rotationY: 0,
        });
      });
    });
    rowStart += rowDepth + DISTRICT_GAP;
  });

  return {
    districts,
    buildings,
    width: Math.max(totalWidth, 0),
    depth: Math.max(totalDepth, 0),
  };
}

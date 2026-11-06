import type { ProjectRow } from '../../shared/boardView.js';
import type { SessionEntity } from '../../shared/projector.js';
import type { VillageAgentPlacement, VillageBuildingPlacement, VillageLandmark, VillageLayout, VillagePath, VillageZone } from './types.js';

const WORLD_WIDTH = 64;
const ZONE_WIDTH = 28;
const ZONE_GAP = 4;
const ZONE_COLUMNS = 2;

function zoneHeight(sessionCount: number): number {
  return 24 + Math.max(0, Math.ceil(sessionCount / 2) - 1) * 5;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function layoutVillage(rows: ProjectRow[], sessions: SessionEntity[]): VillageLayout {
  const sessionsByProject = new Map<string, SessionEntity[]>();
  for (const session of sessions) {
    if (session.projectId) {
      const list = sessionsByProject.get(session.projectId) ?? [];
      list.push(session);
      sessionsByProject.set(session.projectId, list);
    }
  }

  const rowCount = Math.max(1, Math.ceil(rows.length / ZONE_COLUMNS));
  const rowHeights = Array.from({ length: rowCount }, (_, row) =>
    Math.max(...rows.slice(row * ZONE_COLUMNS, row * ZONE_COLUMNS + ZONE_COLUMNS)
      .map((project) => zoneHeight((sessionsByProject.get(project.id) ?? []).length)), 24));

  const height = Math.max(44, 12 + rowHeights.reduce((sum, v) => sum + v, 0) + Math.max(0, rowCount - 1) * 4);
  const zones: VillageZone[] = [];
  const buildings: VillageBuildingPlacement[] = [];
  const agents: VillageAgentPlacement[] = [];
  const paths: VillagePath[] = [
    { x: 29, y: Math.max(24, height - 15), width: 6, height: 15, kind: 'vertical' },
    { x: 24, y: 15, width: 16, height: 14, kind: 'square' },
    { x: 29, y: 8, width: 6, height: 9, kind: 'vertical' },
    { x: 8, y: 18, width: 18, height: 5, kind: 'horizontal' },
    { x: 38, y: 20, width: 18, height: 5, kind: 'horizontal' },
  ];
  const landmarks: VillageLandmark[] = [
    { kind: 'pond', x: 46, y: Math.min(29, height - 12), width: 13, height: 8 },
    { kind: 'cliff', x: 3, y: Math.min(28, height - 13), width: 12, height: 8 },
  ];

  let rowY = 6;
  rowHeights.forEach((rowHeight, row) => {
    const projects = rows.slice(row * ZONE_COLUMNS, row * ZONE_COLUMNS + ZONE_COLUMNS);
    projects.forEach((project, column) => {
      const x = 2 + column * (ZONE_WIDTH + ZONE_GAP);
      zones.push({
        projectId: project.id,
        name: project.name,
        x, y: rowY,
        width: ZONE_WIDTH, height: rowHeight,
        signX: x + (column === 0 ? 23 : 1),
        signY: rowY + 10,
      });
      buildings.push({
        projectId: project.id,
        x: x + 5,
        y: rowY + 2,
        variant: stableHash(project.id) % 8,
      });
      paths.push({ x: x + 9, y: rowY + 7, width: 3, height: 7, kind: 'spur' });

      const projectSessions = sessionsByProject.get(project.id) ?? [];
      projectSessions.forEach((session, idx) => {
        agents.push({
          sessionId: session.id,
          projectId: project.id,
          x: x + 14 + (idx % 2) * 5,
          y: rowY + 3 + Math.floor(idx / 2) * 4,
          tool: session.tool,
          role: session.role,
          state: session.state,
          title: session.title,
        });
      });
    });
    rowY += rowHeight + 4;
  });

  const unmatchedSessions = sessions.filter((s) => !s.projectId);
  unmatchedSessions.forEach((session, idx) => {
    agents.push({
      sessionId: session.id,
      x: 31 + (idx % 3) * 3,
      y: height - 6 + Math.floor(idx / 3) * 2,
      tool: session.tool,
      role: session.role,
      state: session.state,
      title: session.title,
    });
  });

  return { width: WORLD_WIDTH, height, zones, buildings, paths, landmarks, agents, entrance: { x: 31, y: height - 4 } };
}

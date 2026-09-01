import {
  Box3,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { createBuildingGroup } from './buildingFactory.js';
import { layoutVillage3d } from './layout3d.js';
import type { BuildingPlacement, VillageLayout3d } from './types.js';
import { createWorkerGroup } from './workers3d.js';

const districtGeometry = new BoxGeometry(1, 0.42, 1);
const fenceXGeometry = new BoxGeometry(1, 0.38, 0.12);
const fenceZGeometry = new BoxGeometry(0.12, 0.38, 1);
const districtMaterials = [
  new MeshStandardMaterial({ color: 0x78bd65, roughness: 0.92 }),
  new MeshStandardMaterial({ color: 0x88c86d, roughness: 0.92 }),
];
const sandMaterial = new MeshStandardMaterial({ color: 0xf2cf8d, roughness: 0.98 });
const waterMaterial = new MeshStandardMaterial({ color: 0x72cbd2, roughness: 0.32, metalness: 0.03 });
const fenceMaterial = new MeshStandardMaterial({ color: 0xd29354, roughness: 0.86 });
const pathGeometry = new BoxGeometry(1, 0.07, 1);
const pathMaterial = new MeshStandardMaterial({ color: 0xf7dda8, roughness: 1 });
const trunkGeometry = new CylinderGeometry(0.18, 0.24, 1.2, 8);
const crownGeometry = new DodecahedronGeometry(1.05, 0);
const trunkMaterial = new MeshStandardMaterial({ color: 0x765038, roughness: 1 });
const crownMaterials = [
  new MeshStandardMaterial({ color: 0x3e9d61, roughness: 1 }),
  new MeshStandardMaterial({ color: 0x69b85f, roughness: 1 }),
];
const plazaGeometry = new CylinderGeometry(2.2, 2.3, 0.18, 16);
const plazaMaterial = new MeshStandardMaterial({ color: 0xf4c97d, roughness: 0.96 });
const fountainBaseGeometry = new CylinderGeometry(0.68, 0.82, 0.35, 12);
const fountainWaterGeometry = new CylinderGeometry(0.5, 0.5, 0.08, 12);
const fountainStoneMaterial = new MeshStandardMaterial({ color: 0xffedc5, roughness: 0.85 });
const flowerBedGeometry = new DodecahedronGeometry(0.24, 0);
const flowerMaterials = [
  new MeshStandardMaterial({ color: 0xf06c7b, roughness: 0.8 }),
  new MeshStandardMaterial({ color: 0xf9cf54, roughness: 0.8 }),
  new MeshStandardMaterial({ color: 0x9d72d2, roughness: 0.8 }),
];

export interface SceneContent {
  root: Group;
  workerRoot: Group;
  buildings: Map<string, Group>;
  buildingAnchors: Map<string, Vector3>;
  placements: Map<string, BuildingPlacement>;
  layout: VillageLayout3d;
}

function createFence(
  name: string,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): Group {
  const fence = new Group();
  fence.name = name;
  for (const z of [centerZ - depth / 2, centerZ + depth / 2]) {
    const rail = new Mesh(fenceXGeometry, fenceMaterial);
    rail.scale.x = width;
    rail.position.set(centerX, 0.25, z);
    fence.add(rail);
  }
  for (const x of [centerX - width / 2, centerX + width / 2]) {
    const rail = new Mesh(fenceZGeometry, fenceMaterial);
    rail.scale.z = depth;
    rail.position.set(x, 0.25, centerZ);
    fence.add(rail);
  }
  return fence;
}

function createTree(name: string, x: number, z: number, variant: number): Group {
  const tree = new Group();
  tree.name = name;
  tree.position.set(x, 0, z);
  const trunk = new Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  const crown = new Mesh(crownGeometry, crownMaterials[variant % crownMaterials.length]);
  crown.position.y = 2.05;
  crown.castShadow = true;
  tree.add(trunk, crown);
  return tree;
}

function addDistrictLandscape(
  district: Group,
  projectId: string,
  districtX: number,
  districtZ: number,
  width: number,
  depth: number,
  projectBuildings: readonly BuildingPlacement[],
): void {
  const paths = new Group();
  paths.name = `path:${projectId}`;
  for (const placement of projectBuildings) {
    const horizontal = new Mesh(pathGeometry, pathMaterial);
    horizontal.scale.set(Math.max(0.8, Math.abs(placement.x - districtX)), 1, 0.65);
    horizontal.position.set((placement.x + districtX) / 2, 0.03, placement.z + 2.25);
    horizontal.receiveShadow = true;
    const vertical = new Mesh(pathGeometry, pathMaterial);
    vertical.scale.set(0.65, 1, Math.max(0.8, Math.abs(placement.z + 2.25 - districtZ)));
    vertical.position.set(districtX, 0.03, (placement.z + 2.25 + districtZ) / 2);
    vertical.receiveShadow = true;
    paths.add(horizontal, vertical);
  }
  district.add(paths);

  const plaza = new Group();
  plaza.name = `plaza:${projectId}`;
  const plazaFloor = new Mesh(plazaGeometry, plazaMaterial);
  plazaFloor.position.set(districtX, 0.1, districtZ);
  plazaFloor.receiveShadow = true;
  const fountainBase = new Mesh(fountainBaseGeometry, fountainStoneMaterial);
  fountainBase.position.set(districtX, 0.32, districtZ);
  const fountainWater = new Mesh(fountainWaterGeometry, waterMaterial);
  fountainWater.position.set(districtX, 0.53, districtZ);
  plaza.add(plazaFloor, fountainBase, fountainWater);
  district.add(plaza);

  const insetX = width / 2 - 2.2;
  const insetZ = depth / 2 - 2.2;
  const positions = [
    [districtX - insetX, districtZ - insetZ],
    [districtX + insetX, districtZ - insetZ],
    [districtX - insetX, districtZ + insetZ],
    [districtX + insetX, districtZ + insetZ],
  ] as const;
  positions.forEach(([x, z], index) => {
    district.add(createTree(`tree:${projectId}:${index}`, x, z, index));
    const flowers = new Group();
    flowers.name = `flower-bed:${projectId}:${index}`;
    for (let flowerIndex = 0; flowerIndex < 3; flowerIndex += 1) {
      const flower = new Mesh(flowerBedGeometry, flowerMaterials[(index + flowerIndex) % flowerMaterials.length]);
      flower.position.set(x + 1.1 + flowerIndex * 0.38, 0.28, z + 0.7 + (flowerIndex % 2) * 0.25);
      flower.castShadow = true;
      flowers.add(flower);
    }
    district.add(flowers);
  });
}

export function buildSceneContent(village: DerivedWorkspace): SceneContent {
  const layout = layoutVillage3d(village);
  const root = new Group();
  root.name = 'village-content';
  const workerRoot = new Group();
  workerRoot.name = 'workers';
  const buildings = new Map<string, Group>();
  const buildingAnchors = new Map<string, Vector3>();
  const placements = new Map(layout.buildings.map((placement) => [placement.taskId, placement]));

  const water = new Mesh(districtGeometry, waterMaterial);
  water.name = 'world-water';
  water.scale.set(layout.width + 26, 0.45, layout.depth + 22);
  water.position.set(0, -0.72, 0);
  water.receiveShadow = true;
  root.add(water);

  layout.districts.forEach((placement, index) => {
    const district = new Group();
    district.name = `district:${placement.projectId}`;
    const sand = new Mesh(districtGeometry, sandMaterial);
    sand.name = `district-sand:${placement.projectId}`;
    sand.scale.set(placement.width + 1.4, 1, placement.depth + 1.4);
    sand.position.set(placement.x, -0.36, placement.z);
    sand.receiveShadow = true;
    const grass = new Mesh(districtGeometry, districtMaterials[index % districtMaterials.length]);
    grass.name = `district-grass:${placement.projectId}`;
    grass.scale.set(placement.width, 1, placement.depth);
    grass.position.set(placement.x, -0.14, placement.z);
    grass.receiveShadow = true;
    district.add(sand, grass);
    addDistrictLandscape(
      district,
      placement.projectId,
      placement.x,
      placement.z,
      placement.width,
      placement.depth,
      layout.buildings.filter(({ projectId }) => projectId === placement.projectId),
    );
    root.add(district);
  });

  village.projects.forEach((project) => {
    const district = root.getObjectByName(`district:${project.id}`) as Group;
    const districtPlacement = layout.districts.find(({ projectId }) => projectId === project.id)!;
    project.features.forEach((feature) => {
      const featurePlacements = layout.buildings.filter(
        (placement) => placement.compoundId === feature.id && placement.projectId === project.id,
      );
      const xs = featurePlacements.map(({ x }) => x);
      const zs = featurePlacements.map(({ z }) => z);
      const centerX = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : districtPlacement.x;
      const centerZ = zs.length > 0 ? (Math.min(...zs) + Math.max(...zs)) / 2 : districtPlacement.z;
      const width = xs.length > 0 ? Math.max(6, Math.max(...xs) - Math.min(...xs) + 5.5) : 6;
      const depth = zs.length > 0 ? Math.max(6, Math.max(...zs) - Math.min(...zs) + 5.5) : 6;
      district.add(createFence(`compound:${feature.id}`, centerX, centerZ, width, depth));
    });

    const tasks = [...project.features.flatMap((feature) => feature.tasks), ...project.tasks];
    tasks.forEach((task) => {
      const placement = placements.get(task.id)!;
      const building = createBuildingGroup(task);
      building.position.set(placement.x, 0, placement.z);
      building.rotation.y = placement.rotationY;
      building.updateMatrixWorld(true);
      const box = new Box3().setFromObject(building);
      buildings.set(task.id, building);
      buildingAnchors.set(task.id, new Vector3(placement.x, box.max.y + 0.65, placement.z));
      district.add(building);
    });
  });

  root.add(workerRoot);
  return { root, workerRoot, buildings, buildingAnchors, placements, layout };
}

export function syncActivity(content: SceneContent, activity?: ActivitySnapshot): void {
  const materials = new Set<Material>();
  content.workerRoot.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });
  materials.forEach((material) => material.dispose());
  content.workerRoot.clear();
  for (const [index, worker] of (activity?.workers ?? []).entries()) {
    const marker = createWorkerGroup(worker);
    const placement = worker.attachedTaskId
      ? content.placements.get(worker.attachedTaskId)
      : undefined;
    if (placement) {
      const angle = index * 2.2;
      marker.position.set(placement.x + Math.cos(angle) * 2.6, 0.02, placement.z + Math.sin(angle) * 2.2);
    } else {
      marker.position.set(content.layout.width / 2 + 3.5, 0.02, -content.layout.depth / 2 + index * 1.7);
    }
    content.workerRoot.add(marker);
  }
}

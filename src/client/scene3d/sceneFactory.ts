import {
  Box3,
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { createBuildingGroup } from './buildingFactory.js';
import { layoutVillage3d } from './layout3d.js';
import type { BuildingPlacement, VillageLayout3d } from './types.js';
import { createWorkerGroup } from './workers3d.js';

const terrainGeometry = new CylinderGeometry(1, 1, 1, 16);
const fenceXGeometry = new BoxGeometry(1, 0.38, 0.12);
const fenceZGeometry = new BoxGeometry(0.12, 0.38, 1);
const districtMaterials = [
  new MeshStandardMaterial({ color: 0x83c95f, roughness: 0.94 }),
  new MeshStandardMaterial({ color: 0x72be59, roughness: 0.94 }),
];
const meadowMaterial = new MeshStandardMaterial({ color: 0x62ad4d, roughness: 0.98 });
const cliffMaterial = new MeshStandardMaterial({ color: 0xd8a86b, roughness: 1 });
const waterMaterial = new MeshStandardMaterial({ color: 0x72cbd2, roughness: 0.32, metalness: 0.03 });
const fenceMaterial = new MeshStandardMaterial({ color: 0xd29354, roughness: 0.86 });
const pathMaterial = new MeshStandardMaterial({ color: 0xf4d18f, roughness: 1 });
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
const rockGeometry = new DodecahedronGeometry(0.55, 0);
const rockMaterials = [
  new MeshStandardMaterial({ color: 0xb48358, roughness: 1 }),
  new MeshStandardMaterial({ color: 0xc19568, roughness: 1 }),
];
const shrubGeometry = new SphereGeometry(0.65, 8, 6);
const shrubMaterial = new MeshStandardMaterial({ color: 0x328f50, roughness: 1 });
const signPostGeometry = new CylinderGeometry(0.09, 0.12, 1.5, 8);
const signBoardGeometry = new BoxGeometry(1.15, 0.55, 0.18);
const signMaterial = new MeshStandardMaterial({ color: 0xb96d43, roughness: 0.9 });

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
  for (const [index, placement] of projectBuildings.entries()) {
    const bend = index % 2 === 0 ? 1.8 : -1.8;
    const curve = new CatmullRomCurve3([
      new Vector3(districtX, 0, districtZ),
      new Vector3((districtX + placement.x) / 2 + bend, 0, (districtZ + placement.z) / 2),
      new Vector3(placement.x, 0, placement.z + 2.1),
    ]);
    const trail = new Mesh(new TubeGeometry(curve, 18, 0.62, 6, false), pathMaterial);
    trail.name = `trail:${projectId}:${placement.taskId}`;
    trail.scale.y = 0.16;
    trail.position.y = 0.18;
    trail.receiveShadow = true;
    paths.add(trail);
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

  const signpost = new Group();
  signpost.name = `signpost:${projectId}`;
  const signPost = new Mesh(signPostGeometry, signMaterial);
  signPost.position.set(districtX + 2.7, 0.75, districtZ + 1.6);
  const signBoard = new Mesh(signBoardGeometry, signMaterial);
  signBoard.position.set(districtX + 2.7, 1.35, districtZ + 1.6);
  signBoard.rotation.y = -0.25;
  signpost.add(signPost, signBoard);
  district.add(signpost);

  const insetX = width / 2 - 2.2;
  const insetZ = depth / 2 - 2.2;
  const positions = Array.from({ length: 9 }, (_, index) => {
    const angle = index / 9 * Math.PI * 2 + 0.2;
    const radiusScale = index % 2 === 0 ? 1 : 0.82;
    return [
      districtX + Math.cos(angle) * insetX * radiusScale,
      districtZ + Math.sin(angle) * insetZ * radiusScale,
    ] as const;
  });
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
    const rock = new Mesh(rockGeometry, rockMaterials[index % rockMaterials.length]);
    rock.name = `cliff-rock:${projectId}:${index}`;
    rock.position.set(x + Math.cos(index) * 1.4, 0.42, z + Math.sin(index) * 1.1);
    rock.scale.setScalar(index % 3 === 0 ? 1.3 : 0.9);
    rock.castShadow = true;
    district.add(rock);
    const shrub = new Mesh(shrubGeometry, shrubMaterial);
    shrub.name = `shrub:${projectId}:${index}`;
    shrub.position.set(x - Math.cos(index) * 1.2, 0.45, z - Math.sin(index) * 1.1);
    shrub.scale.set(1.2, 0.78, 1);
    shrub.castShadow = true;
    district.add(shrub);
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

  const meadow = new Mesh(terrainGeometry, meadowMaterial);
  meadow.name = 'world-meadow';
  meadow.scale.set((layout.width + 20) / 2, 0.72, (layout.depth + 18) / 2);
  meadow.position.set(0, -0.56, 0);
  meadow.rotation.y = 0.08;
  meadow.receiveShadow = true;
  root.add(meadow);

  layout.districts.forEach((placement, index) => {
    const district = new Group();
    district.name = `district:${placement.projectId}`;
    const cliff = new Mesh(terrainGeometry, cliffMaterial);
    cliff.name = `district-cliff:${placement.projectId}`;
    cliff.scale.set(placement.width / 2 + 1.2, 0.55, placement.depth / 2 + 1.2);
    cliff.position.set(placement.x, -0.2, placement.z);
    cliff.rotation.y = index % 2 === 0 ? 0.08 : -0.07;
    cliff.receiveShadow = true;
    const terrain = new Mesh(terrainGeometry, districtMaterials[index % districtMaterials.length]);
    terrain.name = `district-terrain:${placement.projectId}`;
    terrain.scale.set(placement.width / 2, 0.36, placement.depth / 2);
    terrain.position.set(placement.x, 0.05, placement.z);
    terrain.rotation.y = cliff.rotation.y;
    terrain.receiveShadow = true;
    district.add(cliff, terrain);
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

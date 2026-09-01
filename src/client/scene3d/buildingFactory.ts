import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  SphereGeometry,
} from 'three';
import type { DerivedTask } from '../../server/truth/derive.js';
import { buildingSpec, type FloorKind } from './buildingSpec.js';
import { buildingMaterials } from './materials.js';

const FLOOR_HEIGHT = 1.25;
const FLOOR_GAP = 0.08;
const FLOOR_STEP = FLOOR_HEIGHT + FLOOR_GAP;
const floorGeometry = new BoxGeometry(3.8, FLOOR_HEIGHT, 3.2);
const postGeometry = new BoxGeometry(0.18, FLOOR_HEIGHT, 0.18);
const horizontalBeamX = new BoxGeometry(3.8, 0.16, 0.16);
const horizontalBeamZ = new BoxGeometry(0.16, 0.16, 3.2);
const roofGeometry = new ConeGeometry(2.85, 1.35, 4);
const scaffoldPostGeometry = new BoxGeometry(0.12, 2.4, 0.12);
const scaffoldBeamGeometry = new BoxGeometry(4.8, 0.12, 0.12);
const flagPoleGeometry = new BoxGeometry(0.08, 2.4, 0.08);
const doorGeometry = new BoxGeometry(0.72, 0.92, 0.09);
const windowGeometry = new BoxGeometry(0.62, 0.5, 0.08);
const roofCapGeometry = new BoxGeometry(0.22, 0.2, 4.1);
const chimneyGeometry = new BoxGeometry(0.5, 1.15, 0.5);
const flowerBoxGeometry = new BoxGeometry(0.9, 0.22, 0.3);
const flowerGeometry = new SphereGeometry(0.14, 8, 6);
const foundationGeometry = new CylinderGeometry(2.65, 2.75, 0.22, 8);
const porchGeometry = new BoxGeometry(1.9, 0.18, 1.05);
const roofRidgeGeometry = new BoxGeometry(0.16, 0.16, 4.45);

function stableIndex(value: string, modulo: number): number {
  return [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0) % modulo;
}

function markPickable(mesh: Mesh, taskId: string): Mesh {
  mesh.userData.pickable = true;
  mesh.userData.taskId = taskId;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createFrame(taskId: string, y: number): Group {
  const frame = new Group();
  frame.name = 'frame-floor';
  for (const x of [-1.78, 1.78]) {
    for (const z of [-1.48, 1.48]) {
      const post = markPickable(new Mesh(postGeometry, buildingMaterials.timber), taskId);
      post.position.set(x, y, z);
      frame.add(post);
    }
  }
  for (const z of [-1.48, 1.48]) {
    const beam = markPickable(new Mesh(horizontalBeamX, buildingMaterials.timber), taskId);
    beam.position.set(0, y + FLOOR_HEIGHT / 2, z);
    frame.add(beam);
  }
  for (const x of [-1.78, 1.78]) {
    const beam = markPickable(new Mesh(horizontalBeamZ, buildingMaterials.timber), taskId);
    beam.position.set(x, y + FLOOR_HEIGHT / 2, 0);
    frame.add(beam);
  }
  return frame;
}

function createFloor(kind: FloorKind, taskId: string, index: number): Group | Mesh {
  const y = index * FLOOR_STEP + FLOOR_HEIGHT / 2;
  if (kind === 'frame') return createFrame(taskId, y);
  const material = kind === 'solid' ? buildingMaterials.walls : buildingMaterials.ghost;
  const floor = markPickable(new Mesh(floorGeometry, material), taskId);
  floor.name = `${kind}-floor`;
  floor.position.y = y;
  return floor;
}

function createScaffold(height: number): Group {
  const scaffold = new Group();
  scaffold.name = 'scaffold';
  for (const x of [-2.3, 2.3]) {
    for (const z of [-1.9, 1.9]) {
      const post = new Mesh(scaffoldPostGeometry, buildingMaterials.coral);
      post.scale.y = Math.max(1, height / 2.4);
      post.position.set(x, height / 2, z);
      scaffold.add(post);
    }
  }
  for (const z of [-1.9, 1.9]) {
    for (const y of [0.6, Math.max(1.4, height - 0.4)]) {
      const beam = new Mesh(scaffoldBeamGeometry, buildingMaterials.coral);
      beam.position.set(0, y, z);
      scaffold.add(beam);
    }
  }
  return scaffold;
}

function createReviewFlag(height: number): Group {
  const flag = new Group();
  flag.name = 'review-flag';
  const pole = new Mesh(flagPoleGeometry, buildingMaterials.amber);
  pole.position.y = height + 1.2;
  const clothGeometry = new BufferGeometry();
  clothGeometry.setAttribute('position', new Float32BufferAttribute([
    0, height + 2.3, 0,
    1.25, height + 1.9, 0,
    0, height + 1.55, 0,
  ], 3));
  clothGeometry.computeVertexNormals();
  const cloth = new Mesh(clothGeometry, buildingMaterials.amber);
  flag.add(pole, cloth);
  return flag;
}

export function createBuildingGroup(task: DerivedTask): Group {
  const spec = buildingSpec(task);
  const building = new Group();
  building.name = `building:${task.id}`;
  building.userData.taskId = task.id;
  const foundation = markPickable(new Mesh(foundationGeometry, buildingMaterials.trim), task.id);
  foundation.name = 'foundation';
  foundation.position.y = 0.11;
  building.add(foundation);
  spec.floors.forEach((kind, index) => building.add(createFloor(kind, task.id, index)));
  const height = spec.floorCount * FLOOR_STEP;

  if (spec.floors[0] === 'solid') {
    const door = markPickable(new Mesh(doorGeometry, buildingMaterials.door), task.id);
    door.name = 'door';
    door.position.set(-0.72, 0.46, 1.64);
    const window = markPickable(new Mesh(windowGeometry, buildingMaterials.window), task.id);
    window.name = 'window';
    window.position.set(0.78, 0.78, 1.65);
    const porch = markPickable(new Mesh(porchGeometry, buildingMaterials.trim), task.id);
    porch.name = 'porch';
    porch.position.set(-0.7, 0.2, 2.05);
    building.add(door, window, porch);
  }

  if (spec.roof) {
    const roofMaterials = [buildingMaterials.roof, buildingMaterials.roofBlue, buildingMaterials.roofGreen];
    const roof = markPickable(new Mesh(roofGeometry, roofMaterials[stableIndex(task.id, roofMaterials.length)]), task.id);
    roof.name = 'roof';
    roof.position.y = height + 0.65;
    roof.rotation.y = Math.PI / 4;
    const roofCap = markPickable(new Mesh(roofCapGeometry, buildingMaterials.trim), task.id);
    roofCap.name = 'roof-cap';
    roofCap.position.set(0, height + 1.28, 0);
    const roofRidge = markPickable(new Mesh(roofRidgeGeometry, buildingMaterials.chimney), task.id);
    roofRidge.name = 'roof-ridge';
    roofRidge.position.set(0, height + 1.35, 0);
    const chimney = markPickable(new Mesh(chimneyGeometry, buildingMaterials.chimney), task.id);
    chimney.name = 'chimney';
    chimney.position.set(1.05, height + 1.25, -0.5);
    const flowerBox = markPickable(new Mesh(flowerBoxGeometry, buildingMaterials.timber), task.id);
    flowerBox.name = 'flower-box';
    flowerBox.position.set(0.78, 0.45, 1.78);
    const flower = markPickable(new Mesh(flowerGeometry, buildingMaterials.flower), task.id);
    flower.name = 'flower';
    flower.position.set(0.78, 0.68, 1.82);
    building.add(roof, roofCap, roofRidge, chimney, flowerBox, flower);
  }
  if (spec.scaffold) building.add(createScaffold(Math.max(2.4, height)));
  if (spec.flag) building.add(createReviewFlag(height));
  return building;
}

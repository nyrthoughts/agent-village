import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
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
  spec.floors.forEach((kind, index) => building.add(createFloor(kind, task.id, index)));
  const height = spec.floorCount * FLOOR_STEP;

  if (spec.floors[0] === 'solid') {
    const door = markPickable(new Mesh(doorGeometry, buildingMaterials.door), task.id);
    door.name = 'door';
    door.position.set(-0.72, 0.46, 1.64);
    const window = markPickable(new Mesh(windowGeometry, buildingMaterials.window), task.id);
    window.name = 'window';
    window.position.set(0.78, 0.78, 1.65);
    building.add(door, window);
  }

  if (spec.roof) {
    const roof = markPickable(new Mesh(roofGeometry, buildingMaterials.roof), task.id);
    roof.name = 'roof';
    roof.position.y = height + 0.65;
    roof.rotation.y = Math.PI / 4;
    building.add(roof);
  }
  if (spec.scaffold) building.add(createScaffold(Math.max(2.4, height)));
  if (spec.flag) building.add(createReviewFlag(height));
  return building;
}

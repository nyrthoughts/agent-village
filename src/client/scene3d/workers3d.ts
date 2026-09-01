import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import type { Worker } from '../../shared/activity.js';

const headGeometry = new SphereGeometry(0.34, 14, 10);
const bodyGeometry = new CylinderGeometry(0.28, 0.38, 0.78, 12);
const toolColors = {
  codex: 0x9bc6ff,
  claude: 0xffc090,
  openclaw: 0xb6dc91,
  other: 0xe6dcc5,
} as const;

export function createWorkerGroup(worker: Worker): Group {
  const group = new Group();
  group.name = `worker:${worker.id}`;
  group.userData.attachedTaskId = worker.attachedTaskId;
  group.userData.state = worker.state;
  const material = new MeshStandardMaterial({
    color: toolColors[worker.tool],
    roughness: 0.72,
    transparent: worker.state === 'waiting',
    opacity: worker.state === 'waiting' ? 0.58 : 1,
  });
  const body = new Mesh(bodyGeometry, material);
  body.position.y = 0.45;
  const head = new Mesh(headGeometry, material);
  head.position.y = 1.12;
  body.castShadow = true;
  head.castShadow = true;
  group.add(body, head);
  return group;
}

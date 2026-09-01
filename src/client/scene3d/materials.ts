import {
  DoubleSide,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';

export const buildingMaterials = {
  walls: new MeshStandardMaterial({ color: 0xd3a36e, roughness: 0.82 }),
  timber: new MeshStandardMaterial({ color: 0xd99a3d, roughness: 0.72 }),
  ghost: new MeshBasicMaterial({
    color: 0x78aeb2,
    opacity: 0.24,
    transparent: true,
    wireframe: true,
  }),
  roof: new MeshStandardMaterial({ color: 0x557b62, roughness: 0.88 }),
  coral: new MeshStandardMaterial({ color: 0xe66d55, roughness: 0.68 }),
  amber: new MeshStandardMaterial({ color: 0xe7a93f, roughness: 0.65, side: DoubleSide }),
  door: new MeshStandardMaterial({ color: 0x4c3426, roughness: 0.9 }),
  window: new MeshStandardMaterial({ color: 0x9bc6c8, emissive: 0x203b3c, roughness: 0.28 }),
  outline: new LineBasicMaterial({ color: 0x17201b }),
} as const;

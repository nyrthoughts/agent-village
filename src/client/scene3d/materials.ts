import {
  DoubleSide,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';

export const buildingMaterials = {
  walls: new MeshStandardMaterial({ color: 0xffd79d, roughness: 0.78 }),
  timber: new MeshStandardMaterial({ color: 0xb96843, roughness: 0.72 }),
  ghost: new MeshBasicMaterial({
    color: 0x50a9d1,
    opacity: 0.3,
    transparent: true,
    wireframe: true,
  }),
  roof: new MeshStandardMaterial({ color: 0xd96551, roughness: 0.82 }),
  roofBlue: new MeshStandardMaterial({ color: 0x4f8fb8, roughness: 0.82 }),
  roofGreen: new MeshStandardMaterial({ color: 0x5d9b68, roughness: 0.82 }),
  trim: new MeshStandardMaterial({ color: 0xfff0c9, roughness: 0.72 }),
  chimney: new MeshStandardMaterial({ color: 0xa85943, roughness: 0.9 }),
  flower: new MeshStandardMaterial({ color: 0xf06c7b, roughness: 0.7 }),
  coral: new MeshStandardMaterial({ color: 0xe66d55, roughness: 0.68 }),
  amber: new MeshStandardMaterial({ color: 0xe7a93f, roughness: 0.65, side: DoubleSide }),
  door: new MeshStandardMaterial({ color: 0x70452f, roughness: 0.9 }),
  window: new MeshStandardMaterial({ color: 0x7ed6e8, emissive: 0x1e5866, roughness: 0.22 }),
  outline: new LineBasicMaterial({ color: 0x4b493f }),
} as const;

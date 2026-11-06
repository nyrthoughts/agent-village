/**
 * Extract individual transparent PNG sprites from the generated atlas JPEGs.
 *
 * Source atlases (assets/source/):
 *   buildings-atlas.jpg — 1024×1024, 2×2 grid, chroma magenta ~(243,3,220)
 *   bots-atlas.jpg      — 1024×1024, 4 cols × 2 rows, chroma magenta ~(235,0,137)
 *
 * Output (public/sprites/):
 *   building-{codex,claude,openclaw,forge}.png   — trimmed isometric buildings
 *   bot-{codex,claude,openclaw,forge}-idle.png   — standing pose
 *   bot-{codex,claude,openclaw,forge}-walk.png   — walking pose
 *
 * Chroma-keying: for each pixel, compute distance in RGB space to the sampled
 * background color. Pixels within tolerance become fully transparent; pixels
 * in a transition band get partial alpha for anti-aliased edges.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'assets/source');
const OUT = resolve(ROOT, 'public/sprites');

async function chromaKey(inputBuffer, bgR, bgG, bgB, tolerance = 52, feather = 22) {
  const { data, info } = await sharp(inputBuffer).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rgba = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const si = i * channels;
    const di = i * 4;
    const r = data[si];
    const g = data[si + 1];
    const b = data[si + 2];

    const dr = r - bgR;
    const dg = g - bgG;
    const db = b - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist < tolerance) {
      rgba[di] = 0;
      rgba[di + 1] = 0;
      rgba[di + 2] = 0;
      rgba[di + 3] = 0;
    } else if (dist < tolerance + feather) {
      const alpha = Math.round(((dist - tolerance) / feather) * 255);
      rgba[di] = r;
      rgba[di + 1] = g;
      rgba[di + 2] = b;
      rgba[di + 3] = alpha;
    } else {
      rgba[di] = r;
      rgba[di + 1] = g;
      rgba[di + 2] = b;
      rgba[di + 3] = 255;
    }
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } });
}

async function extractCell(file, x, y, w, h, bgR, bgG, bgB, outName, targetHeight) {
  const cropped = await sharp(file).extract({ left: x, top: y, width: w, height: h }).toBuffer();
  const keyed = await chromaKey(cropped, bgR, bgG, bgB);
  const trimmed = keyed.trim({ threshold: 5 });
  let pipeline = trimmed;
  if (targetHeight) {
    pipeline = pipeline.resize({ height: targetHeight, fit: 'inside', withoutEnlargement: false });
  }
  const outPath = resolve(OUT, outName);
  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log(`  ${outName}: ${meta.width}x${meta.height}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const buildingsFile = resolve(SRC, 'buildings-atlas.jpg');
  const botsFile = resolve(SRC, 'bots-atlas.jpg');

  console.log('Extracting buildings (2x2 grid, bg ~243,3,220)...');
  const bCells = [
    { name: 'building-codex.png', x: 0, y: 0 },
    { name: 'building-claude.png', x: 512, y: 0 },
    { name: 'building-openclaw.png', x: 0, y: 512 },
    { name: 'building-forge.png', x: 512, y: 512 },
  ];
  for (const cell of bCells) {
    await extractCell(buildingsFile, cell.x, cell.y, 512, 512, 243, 3, 220, cell.name, 220);
  }

  console.log('Extracting bots (4x2 grid, bg ~235,0,137)...');
  const tools = ['codex', 'claude', 'openclaw', 'forge'];
  for (let col = 0; col < 4; col++) {
    const tool = tools[col];
    await extractCell(botsFile, col * 256, 0, 256, 512, 235, 0, 137, `bot-${tool}-idle.png`, 80);
    await extractCell(botsFile, col * 256, 512, 256, 512, 235, 0, 137, `bot-${tool}-walk.png`, 80);
  }

  console.log('Done. Assets in public/sprites/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

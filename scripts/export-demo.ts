import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixtureSnapshot } from '../src/server/board/staticBoard.js';

/**
 * Static GitHub Pages export: the fictional six-project board only. No API endpoint, native
 * source, journal or private file is involved; the snapshot is labelled fictional.
 */
const fixturePath = resolve('fixtures/board.demo.json');
const outputDir = resolve('public/demo');

const snapshot = fixtureSnapshot(JSON.parse(await readFile(fixturePath, 'utf8')));
if (!snapshot.fictional) throw new Error('The public demo must be fictional');

await mkdir(outputDir, { recursive: true });
// Retire snapshots of the former village view so Pages only serves the board.
await Promise.all(['village.json', 'activity.json'].map((name) => rm(resolve(outputDir, name), { force: true })));
await writeFile(resolve(outputDir, 'board.json'), `${JSON.stringify(snapshot)}\n`, 'utf8');

console.log('Exported the fictional demo board.');

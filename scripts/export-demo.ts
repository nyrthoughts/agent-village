import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { adaptAmcPayload } from '../src/server/activity/amcAdapter.js';
import { loadWorkspace } from '../src/server/config/load.js';
import { deriveWorkspace } from '../src/server/truth/derive.js';
import { verifyWorkspaceEvidence } from '../src/server/truth/evidence/verify.js';

const villagePath = resolve('fixtures/village.demo.yaml');
const activityPath = resolve('fixtures/amc/dashboard.nominal.json');
const outputDir = resolve('public/demo');
const fetchedAt = '2026-08-31T15:00:00.000Z';

const loaded = loadWorkspace(villagePath);
if (!loaded.ok) {
  throw new Error(`Demo fixture is invalid: ${loaded.errors.join('; ')}`);
}

const verdicts = await verifyWorkspaceEvidence(loaded.workspace, dirname(villagePath));
const village = deriveWorkspace(loaded.workspace, verdicts);
const activityPayload: unknown = JSON.parse(await readFile(activityPath, 'utf8'));
const activity = adaptAmcPayload(
  activityPayload,
  loaded.workspace.activity_mapping ?? [],
  'demo',
  fetchedAt,
);

if (!activity) throw new Error('Demo activity fixture is invalid');

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, 'village.json'), `${JSON.stringify(village)}\n`, 'utf8'),
  writeFile(resolve(outputDir, 'activity.json'), `${JSON.stringify(activity)}\n`, 'utf8'),
]);

console.log('Exported redacted demo snapshots.');

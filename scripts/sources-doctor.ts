import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { MANIFEST_FILE } from '../src/server/config/projectManifest.js';
import { DEFAULT_AUTH_DIRECTORY } from '../src/server/auth/privateState.js';
import { runSourcesDoctor } from '../src/server/activity/sources/doctor.js';

// Usage: npm run sources:doctor [-- --home <directory>]
// Read-only and offline: prints roots, counts and client identifiers, never conversation text.
const flag = process.argv.indexOf('--home');
const home = flag >= 0 && process.argv[flag + 1] ? resolve(process.argv[flag + 1]!) : homedir();
const authDirectory = process.env.VILLAGE_AUTH_DIR ?? (flag >= 0 ? join(home, '.local/share/agent-village') : DEFAULT_AUTH_DIRECTORY);
console.log(await runSourcesDoctor({ home, env: process.env, platform: process.platform, manifestPath: join(authDirectory, MANIFEST_FILE) }));

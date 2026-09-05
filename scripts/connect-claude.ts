import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mergeClaudeHooks, removeClaudeHooks } from '../src/server/activity/claudeHooks.js';
import { DEFAULT_AUTH_DIRECTORY, readPrivateFile } from '../src/server/auth/privateState.js';

const settingsPath = process.env.CLAUDE_SETTINGS_PATH
  ?? join(homedir(), '.claude', 'settings.json');
const endpoint = process.env.AGENT_VILLAGE_HOOK_URL
  ?? 'http://127.0.0.1:4180/api/hooks/claude';
const remove = process.argv.includes('--remove');
const headerPath = join(process.env.VILLAGE_AUTH_DIR ?? DEFAULT_AUTH_DIRECTORY, 'ingestion.header');
if (!remove && !readPrivateFile(headerPath)) throw new Error('Run npm run auth:setup locally before connecting hooks');

let current: unknown = {};
try {
  current = JSON.parse(await readFile(settingsPath, 'utf8')) as unknown;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const next = remove ? removeClaudeHooks(current) : mergeClaudeHooks(current, endpoint, headerPath);
await mkdir(dirname(settingsPath), { recursive: true });
const temporaryPath = `${settingsPath}.agent-village.${randomBytes(8).toString('hex')}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
await rename(temporaryPath, settingsPath);
console.log(remove
  ? `Removed Agent Village hooks from ${settingsPath}`
  : `Connected Claude Code hooks to ${endpoint}`);

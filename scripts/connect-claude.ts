import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mergeClaudeHooks, removeClaudeHooks } from '../src/server/activity/claudeHooks.js';

const settingsPath = process.env.CLAUDE_SETTINGS_PATH
  ?? join(homedir(), '.claude', 'settings.json');
const endpoint = process.env.AGENT_VILLAGE_HOOK_URL
  ?? 'http://127.0.0.1:4180/api/hooks/claude';
const remove = process.argv.includes('--remove');

let current: unknown = {};
try {
  current = JSON.parse(await readFile(settingsPath, 'utf8')) as unknown;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const next = remove ? removeClaudeHooks(current) : mergeClaudeHooks(current, endpoint);
await mkdir(dirname(settingsPath), { recursive: true });
const temporaryPath = `${settingsPath}.agent-village.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
await rename(temporaryPath, settingsPath);
console.log(remove
  ? `Removed Agent Village hooks from ${settingsPath}`
  : `Connected Claude Code hooks to ${endpoint}`);

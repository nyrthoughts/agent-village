import { isAbsolute } from 'node:path';
import { CLAUDE_HOOK_EVENTS } from './hookStore.js';

const MARKER = 'agent-village-hook';

interface ClaudeHookHandler {
  type: string;
  command?: string;
  [key: string]: unknown;
}

interface ClaudeHookGroup {
  matcher?: string;
  hooks: ClaudeHookHandler[];
  [key: string]: unknown;
}

export interface ClaudeSettings {
  hooks: Record<string, ClaudeHookGroup[]>;
  [key: string]: unknown;
}

function assertLoopback(endpoint: string): void {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Claude hook endpoint must use loopback HTTP');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/api/hooks/claude') {
    throw new Error('Claude hook endpoint must be the local ingestion route');
  }
}

function shellQuote(value: string): string { return `'${value.replace(/'/g, "'\\''")}'`; }

function hookCommand(endpoint: string, headerPath: string): string {
  // curl loads Authorization from a private file; neither argv nor settings contain its value.
  return `curl -q --noproxy '*' --proto '=http' --max-redirs 0 --silent --max-time 0.25 --request POST --header 'content-type: application/json' --header ${shellQuote(`@${headerPath}`)} --data-binary @- ${shellQuote(endpoint)} >/dev/null 2>&1 || true # ${MARKER}`;
}

function asSettings(value: unknown): ClaudeSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { hooks: {} };
  const source = value as Record<string, unknown>;
  const hooks = source.hooks && typeof source.hooks === 'object' && !Array.isArray(source.hooks)
    ? source.hooks as Record<string, ClaudeHookGroup[]>
    : {};
  return { ...source, hooks } as ClaudeSettings;
}

export function mergeClaudeHooks(value: unknown, endpoint: string, headerPath: string): ClaudeSettings {
  assertLoopback(endpoint);
  if (!isAbsolute(headerPath) || /[\r\n\0]/.test(headerPath)) throw new Error('Private hook header path must be absolute');
  const settings = removeClaudeHooks(value); // Upgrade existing marked commands, preserving unrelated handlers.
  const command = hookCommand(endpoint, headerPath);
  const hooks = { ...settings.hooks };
  for (const event of CLAUDE_HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? [...hooks[event]!] : [];
    const present = groups.some((group) =>
      Array.isArray(group.hooks)
      && group.hooks.some((handler) => handler.command?.includes(MARKER)),
    );
    if (!present) groups.push({ hooks: [{ type: 'command', command, timeout: 1 }] });
    hooks[event] = groups;
  }
  return { ...settings, hooks };
}

export function removeClaudeHooks(value: unknown): ClaudeSettings {
  const settings = asSettings(value);
  const hooks: Record<string, ClaudeHookGroup[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const cleaned = (Array.isArray(groups) ? groups : []).flatMap((group) => {
      const handlers = Array.isArray(group.hooks)
        ? group.hooks.filter((handler) => !handler.command?.includes(MARKER))
        : [];
      return handlers.length > 0 ? [{ ...group, hooks: handlers }] : [];
    });
    if (cleaned.length > 0) hooks[event] = cleaned;
  }
  return { ...settings, hooks };
}

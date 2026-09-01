const MARKER = 'agent-village-hook';
const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd',
] as const;

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
}

function hookCommand(endpoint: string): string {
  return `curl --silent --max-time 0.25 --request POST --header 'content-type: application/json' --data-binary @- '${endpoint}' >/dev/null 2>&1 || true # ${MARKER}`;
}

function asSettings(value: unknown): ClaudeSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { hooks: {} };
  const source = value as Record<string, unknown>;
  const hooks = source.hooks && typeof source.hooks === 'object' && !Array.isArray(source.hooks)
    ? source.hooks as Record<string, ClaudeHookGroup[]>
    : {};
  return { ...source, hooks } as ClaudeSettings;
}

export function mergeClaudeHooks(value: unknown, endpoint: string): ClaudeSettings {
  assertLoopback(endpoint);
  const settings = asSettings(value);
  const command = hookCommand(endpoint);
  const hooks = { ...settings.hooks };
  for (const event of EVENTS) {
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

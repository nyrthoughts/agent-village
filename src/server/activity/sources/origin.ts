import type { SessionOrigin } from '../../../shared/activity.js';

/**
 * Client identifiers recorded by each tool, mapped conservatively. Values we have not seen
 * documented stay `unknown`; the raw string is shown only by `npm run sources:doctor` so the
 * owner can report it and the mapping can be extended.
 */

/** Codex `session_meta.originator` (e.g. `codex_cli_rs`, `codex_vscode`) and `source` (`cli`, `vscode`, `exec`, `mcp`). */
export function codexOrigin(originator?: string, source?: string): SessionOrigin {
  const name = originator?.toLowerCase() ?? '';
  if (/desktop|codex[_ -]?app\b|mac[_ -]?app/.test(name)) return 'desktop';
  if (/vscode|jetbrains|intellij|cursor|windsurf|zed|ide/.test(name)) return 'ide';
  if (/exec/.test(name)) return 'exec';
  if (/cloud|web/.test(name)) return 'cloud';
  if (/^codex[_-](cli|tui)/.test(name)) return 'cli';
  switch (source?.toLowerCase()) {
    case 'cli': return 'cli';
    case 'vscode': case 'ide': return 'ide';
    case 'exec': return 'exec';
    case 'desktop': case 'app': return 'desktop';
    case 'cloud': return 'cloud';
    default: return 'unknown';
  }
}

/**
 * Claude Code `entrypoint`, recorded on every journal line and in process records. `remote_desktop`
 * was observed on a cloud session started from the desktop app (it runs elsewhere, hence `cloud`);
 * other values (`cli`, `sdk-*`, `claude-vscode`, `claude-desktop`) follow the client's naming.
 */
export function claudeOrigin(entrypoint?: string): SessionOrigin {
  const name = entrypoint?.toLowerCase() ?? '';
  if (!name) return 'unknown';
  if (name === 'cli') return 'cli';
  if (/^remote|web|cloud/.test(name)) return 'cloud';
  if (/desktop/.test(name)) return 'desktop';
  if (/vscode|jetbrains|intellij|cursor|windsurf|zed|ide/.test(name)) return 'ide';
  if (/^sdk|exec|github-action/.test(name)) return 'exec';
  return 'unknown';
}

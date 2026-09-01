const HOME_OR_SYSTEM_PATH = /(?:\/(?:Users|home|tmp|var|private|opt|etc)\/[^\s"']+|[A-Za-z]:\\Users\\[^\s"']+)/gi;
const EMAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;
const SECRET = /\b(?:sk|ghp|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/gi;

export function redactTitle(title: string): string {
  return title
    .replace(HOME_OR_SYSTEM_PATH, '[redacted-path]')
    .replace(EMAIL, '[redacted-email]')
    .replace(SECRET, '[redacted-secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

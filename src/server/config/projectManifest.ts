import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { expandHome, normalizeRemote, ruleKey, type DeclaredProject, type ProjectRule } from '../activity/projectResolver.js';
import type { LoadError } from './load.js';

/**
 * Optional owner file `projects.yaml` in the private directory (VILLAGE_AUTH_DIR).
 *
 * projects:
 *   - name: Warehouse
 *     remotes: [github.com/demo-org/warehouse]
 *     paths: [~/code/monorepo/packages/warehouse]
 *     titles: ["^warehouse:"]
 *     sessions: [codex:abc123]
 *     links: [{ title: Pricing brainstorm, url: "https://claude.ai/chat/...", source: claude-app }]
 * catchAll: [~, /tmp, /tmp/**]
 */
export const MANIFEST_FILE = 'projects.yaml';
export const MANIFEST_ERROR_PREFIX = 'Manifeste projects.yaml : ';
const MAX_BYTES = 64 * 1024;

// A bare `~` is null in YAML; read it as the home directory, which is what the owner meant.
const pathRef = z.preprocess((value) => value === null ? '~' : value, z.string().trim().min(1).max(1024)
  .refine((value) => value === '~' || value.startsWith('~/') || value.startsWith('/'), 'path must be absolute or start with ~/'));
const remoteRef = z.string().trim().min(1).max(512).transform((value, context) => {
  // `host/owner/repo` is the documented short form; clone URLs are accepted too.
  const normalized = normalizeRemote(value) ?? (/^[a-z0-9.-]+\.[a-z]+\//i.test(value) ? normalizeRemote(`https://${value}`) : undefined);
  if (!normalized) { context.addIssue({ code: z.ZodIssueCode.custom, message: 'not a recognised Git remote (expected host/owner/repo or a clone URL)' }); return z.NEVER; }
  return normalized;
});
const titleRef = z.string().min(1).max(200).transform((value, context) => {
  try { return new RegExp(value, 'i'); } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid regular expression' });
    return z.NEVER;
  }
});
const sessionRef = z.string().regex(/^(?:codex|claude|openclaw):[A-Za-z0-9._:-]{1,120}$/, 'expected source:id, such as codex:abc123');
const link = z.object({
  title: z.string().trim().min(1).max(160),
  // https only: owner links become clickable anchors and must never carry javascript: or data: URLs.
  url: z.string().max(2048).url().refine((value) => new URL(value).protocol === 'https:', 'links must use https'),
  source: z.enum(['claude-app', 'chatgpt', 'other']).default('other'),
}).strict();
const project = z.object({
  name: z.string().trim().min(1).max(80),
  remotes: z.array(remoteRef).max(20).default([]),
  paths: z.array(pathRef).max(20).default([]),
  titles: z.array(titleRef).max(20).default([]),
  sessions: z.array(sessionRef).max(200).default([]),
  links: z.array(link).max(50).default([]),
}).strict();
export const projectManifestSchema = z.object({
  projects: z.array(project).max(200).default([]),
  catchAll: z.array(pathRef).max(20).optional(),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.projects.forEach((entry, index) => {
    const name = entry.name.toLowerCase();
    if (seen.has(name)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', index, 'name'], message: 'duplicate project name' });
    seen.add(name);
  });
});

export interface LoadedManifest { rules: ProjectRule[]; catchAll?: string[]; declared: DeclaredProject[] }
export type ManifestResult = { ok: true; manifest: LoadedManifest } | { ok: false; errors: LoadError[] };

/** Pure: YAML text to resolver rules. Paths are expanded against `home`. */
export function parseProjectManifest(text: string, home: string): ManifestResult {
  let raw: unknown;
  try { raw = parse(text); } catch (error) {
    return { ok: false, errors: [{ path: '', message: `malformed YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` }] };
  }
  const result = projectManifestSchema.safeParse(raw ?? {});
  if (!result.success) return { ok: false, errors: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) };
  const { projects, catchAll } = result.data;
  return { ok: true, manifest: {
    rules: projects.map((entry) => ({ name: entry.name, sessions: entry.sessions, remotes: entry.remotes,
      paths: entry.paths.map((path) => expandHome(path, home)), titles: entry.titles })),
    catchAll: catchAll?.map((path) => expandHome(path, home)),
    declared: projects.map((entry) => ({ key: ruleKey(entry.name), name: entry.name, links: entry.links })),
  } };
}

export function manifestErrorMessage(errors: LoadError[]): string {
  return `${MANIFEST_ERROR_PREFIX}${errors.map((error) => `${error.path || '(root)'}: ${error.message}`).join(' ; ')}`.slice(0, 500);
}

/** Reads the manifest only when it changes. A missing file is not an error; a bad one never throws. */
export class ProjectManifestFile {
  private cached?: { signature: string; value: { manifest?: LoadedManifest; error?: string } };
  constructor(private readonly path: string, private readonly home: string) {}

  read(): { manifest?: LoadedManifest; error?: string } {
    let fd: number;
    try { fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') { this.cached = undefined; return {}; }
      return { error: `${MANIFEST_ERROR_PREFIX}${code === 'ELOOP' ? 'symbolic links are not accepted' : 'file cannot be read'}` };
    }
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_BYTES) return { error: `${MANIFEST_ERROR_PREFIX}must be a regular file of at most 64 KiB` };
      // Someone else able to edit the rules could move conversations between projects.
      if ((stat.mode & 0o022) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
        return { error: `${MANIFEST_ERROR_PREFIX}must be owned by you and not writable by others (chmod 600)` };
      }
      const signature = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
      if (this.cached?.signature === signature) return this.cached.value;
      const parsed = parseProjectManifest(readFileSync(fd, 'utf8'), this.home);
      const value = parsed.ok ? { manifest: parsed.manifest } : { error: manifestErrorMessage(parsed.errors) };
      this.cached = { signature, value };
      return value;
    } catch {
      return { error: `${MANIFEST_ERROR_PREFIX}file cannot be read` };
    } finally { closeSync(fd); }
  }
}

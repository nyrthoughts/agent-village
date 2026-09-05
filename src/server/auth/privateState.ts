import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BOOTSTRAP_TTL_MS = 15 * 60_000;
export const DEFAULT_AUTH_DIRECTORY = join(homedir(), '.local', 'share', 'agent-village');

/** Bundled server.mjs has a different depth; only an actual source checkout is a repository boundary. */
export function sourceRepositoryRoot(moduleUrl: string = import.meta.url): string | undefined {
  const candidate = fileURLToPath(new URL('../../../', moduleUrl));
  if (!existsSync(join(candidate, 'src', 'server', 'auth', 'privateState.ts'))
    || !existsSync(join(candidate, 'package.json'))) return undefined;
  const manifest: unknown = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !('name' in manifest) || manifest.name !== 'agent-village') return undefined;
  return realpathSync(candidate);
}

export function ensurePrivateDirectory(directory: string): string {
  const path = resolve(directory);
  const sourceRoot = sourceRepositoryRoot();
  if (sourceRoot && (path === sourceRoot || path.startsWith(`${sourceRoot}/`))) throw new Error('Auth directory must stay outside the source repository');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0
    || (process.getuid && stat.uid !== process.getuid())) throw new Error('Auth directory must be owner-only (0700)');
  const canonical = realpathSync(path);
  if (sourceRoot && (canonical === sourceRoot || canonical.startsWith(`${sourceRoot}/`))) throw new Error('Auth directory must stay outside the source repository');
  return canonical;
}

export function readPrivateFile(path: string): { text: string; modifiedAt: number } | undefined {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.size > 64 * 1024
      || (process.getuid && stat.uid !== process.getuid())) throw new Error('Auth files must be private regular files (0600)');
    return { text: readFileSync(fd, 'utf8'), modifiedAt: stat.mtimeMs };
  } finally { closeSync(fd); }
}

export function writePrivateFile(path: string, text: string, exclusive = false): void {
  if (exclusive) { writeFileSync(path, text, { flag: 'wx', mode: 0o600 }); return; }
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
  try { renameSync(temporary, path); }
  finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

/** Manual local setup only. Never returns or logs the generated secrets. */
export function prepareOwnerSetup(directory = DEFAULT_AUTH_DIRECTORY, now = Date.now()): { bootstrapPath: string; hookHeaderPath: string } {
  const root = ensurePrivateDirectory(directory);
  if (readPrivateFile(join(root, 'owner.json'))) throw new Error('A village owner is already enrolled');
  const hookHeaderPath = join(root, 'ingestion.header');
  if (!readPrivateFile(hookHeaderPath)) writePrivateFile(hookHeaderPath, `Authorization: Bearer ${randomBytes(32).toString('base64url')}\n`, true);
  const bootstrapPath = join(root, 'bootstrap.txt');
  const existing = readPrivateFile(bootstrapPath);
  if (!existing || now - existing.modifiedAt >= BOOTSTRAP_TTL_MS) {
    writePrivateFile(bootstrapPath, `${randomBytes(32).toString('base64url')}\n`, !existing);
  }
  return { bootstrapPath, hookHeaderPath };
}

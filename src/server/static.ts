import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

export interface StaticResult {
  status: number;
  contentType: string;
  body: Buffer | string;
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function hasTraversal(rawPath: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return true;
  }
  return (
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    decoded.split('/').some((segment) => segment === '..')
  );
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

export async function readStatic(rawPath: string, distDir: string): Promise<StaticResult> {
  if (hasTraversal(rawPath)) {
    return { status: 400, contentType: 'application/json; charset=utf-8', body: '{"error":"bad_path"}' };
  }

  try {
    const root = await realpath(resolve(distDir));
    const relative = decodeURIComponent(rawPath).replace(/^\/+/, '');
    const lexicalCandidate = resolve(root, relative || 'index.html');
    let candidate = lexicalCandidate;

    try {
      if (!(await stat(candidate)).isFile()) throw new Error('not a file');
      candidate = await realpath(candidate);
    } catch {
      candidate = await realpath(join(root, 'index.html'));
    }

    if (!inside(root, candidate)) {
      return { status: 400, contentType: 'application/json; charset=utf-8', body: '{"error":"bad_path"}' };
    }

    return {
      status: 200,
      contentType: CONTENT_TYPES[extname(candidate)] ?? 'application/octet-stream',
      body: await readFile(candidate),
    };
  } catch {
    return { status: 404, contentType: 'application/json; charset=utf-8', body: '{"error":"not_found"}' };
  }
}

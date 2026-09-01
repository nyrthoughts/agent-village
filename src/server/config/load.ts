import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { workspaceSchema, type Workspace } from '../../shared/schema.js';

export interface LoadError {
  path: string;
  message: string;
}

export type LoadResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; errors: LoadError[] };

export function loadWorkspace(filePath: string): LoadResult {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      errors: [{ path: '', message: `could not read ${filePath}: ${message(error)}` }],
    };
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (error) {
    return {
      ok: false,
      errors: [{ path: '', message: `malformed YAML: ${message(error)}` }],
    };
  }

  const result = workspaceSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  return { ok: true, workspace: result.data };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

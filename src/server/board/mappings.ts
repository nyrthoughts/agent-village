import { join } from 'node:path';
import { z } from 'zod';
import { ensurePrivateDirectory, readPrivateFile, writePrivateFile } from '../auth/privateState.js';

const MAX_MAPPINGS = 300;
const entry = z.object({ projectId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), projectName: z.string().max(160), mappedAt: z.string().datetime() }).strict();
const fileSchema = z.object({ version: z.literal(1), mappings: z.record(z.string().regex(/^[A-Za-z0-9._:@/+-]{1,160}$/), entry) }).strict();
export type ProjectMapping = z.infer<typeof entry>;

/** Owner attachments of unmatched session identities, kept in a private 0600 file outside the repository. */
export class MappingStore {
  readonly directory: string;
  constructor(directory: string) { this.directory = ensurePrivateDirectory(directory); }

  read(): Record<string, ProjectMapping> {
    const raw = readPrivateFile(join(this.directory, 'project-mappings.json'));
    return raw ? fileSchema.parse(JSON.parse(raw.text)).mappings : {};
  }

  save(sessionId: string, mapping: ProjectMapping): void {
    const mappings = { ...this.read(), [sessionId]: entry.parse(mapping) };
    const ids = Object.keys(mappings);
    if (ids.length > MAX_MAPPINGS) {
      ids.sort((a, b) => mappings[a]!.mappedAt.localeCompare(mappings[b]!.mappedAt));
      for (const id of ids.slice(0, ids.length - MAX_MAPPINGS)) delete mappings[id];
    }
    writePrivateFile(join(this.directory, 'project-mappings.json'), JSON.stringify(fileSchema.parse({ version: 1, mappings })));
  }
}

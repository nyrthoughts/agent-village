import { join } from 'node:path';
import { z } from 'zod';
import { nativeProjectId, planDraftSchema, projectPlanSchema, type ProjectPlan, type ProjectPlansById } from '../shared/projectPlan.js';
import { ensurePrivateDirectory, readPrivateFile, writePrivateFile } from './auth/privateState.js';

const ledgerSchema = z.object({ version: z.literal(1), plans: z.record(nativeProjectId, projectPlanSchema) }).strict();

/** Single-process, bounded local metadata; never reads or modifies agent instructions. */
export class ProjectPlans {
  readonly directory: string;
  constructor(directory: string) { this.directory = ensurePrivateDirectory(directory); }
  read(): ProjectPlansById {
    ensurePrivateDirectory(this.directory);
    const raw = readPrivateFile(join(this.directory, 'project-plans.json'));
    return raw ? ledgerSchema.parse(JSON.parse(raw.text)).plans : {};
  }
  save(id: string, input: unknown, revision: number, actor: 'owner' | 'local-check' = 'owner', projectName?: string): ProjectPlan {
    const parsed = planDraftSchema.safeParse(input);
    if (!nativeProjectId.safeParse(id).success || !parsed.success || !Number.isInteger(revision) || revision < 0) throw new Error('invalid_plan');
    const plans = this.read();
    const previous = plans[id];
    if (revision !== (previous?.revision ?? 0)) throw new Error('plan_conflict');
    const now = new Date().toISOString();
    const next: ProjectPlan = { ...parsed.data, projectName: projectName?.trim().slice(0, 160) || previous?.projectName, revision: revision + 1, updatedAt: now,
      milestones: parsed.data.milestones.map((item) => {
        if (!item.validated) return item;
        const prior = previous?.milestones.find((m) => m.id === item.id);
        const unchanged = prior?.validated && prior.title === item.title && prior.note === item.note;
        return { ...item, validatedAt: unchanged ? prior.validatedAt : now, validatedBy: unchanged ? prior.validatedBy : actor };
      }),
    };
    plans[id] = next;
    const text = JSON.stringify({ version: 1, plans });
    if (Object.keys(plans).length > 100 || Buffer.byteLength(text) > 64 * 1024) throw new Error('plan_capacity');
    writePrivateFile(join(this.directory, 'project-plans.json'), text);
    return next;
  }
}

import { z } from 'zod';

export const nativeProjectId = z.string().regex(/^project-[a-f0-9]{12}$/);
const milestone = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,48}$/),
  title: z.string().trim().min(1).max(180),
  validated: z.boolean(),
  note: z.string().trim().max(500),
});
const validNotes = (items: { validated: boolean; note: string }[]) => items.every((m) => !m.validated || m.note.length > 0);
const uniqueIds = (items: { id: string }[]) => new Set(items.map((m) => m.id)).size === items.length;

export const planDraftSchema = z.strictObject({
  objective: z.string().trim().min(1).max(700),
  milestones: z.array(milestone).min(1).max(12).refine(validNotes).refine(uniqueIds),
});
export const projectPlanSchema = z.strictObject({
  projectName: z.string().trim().min(1).max(160).optional(),
  objective: z.string().trim().min(1).max(700),
  milestones: z.array(milestone.extend({
    validatedAt: z.iso.datetime().optional(),
    validatedBy: z.enum(['owner', 'local-check']).optional(),
  })).min(1).max(12).refine(validNotes).refine(uniqueIds).refine((items) => items.every((m) =>
    m.validated ? Boolean(m.validatedAt && m.validatedBy) : !m.validatedAt && !m.validatedBy)),
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export const planWriteSchema = z.strictObject({ projectId: nativeProjectId, revision: z.number().int().min(0), plan: planDraftSchema });
export type PlanDraft = z.infer<typeof planDraftSchema>;
export type ProjectPlan = z.infer<typeof projectPlanSchema>;
export type ProjectPlansById = Record<string, ProjectPlan>;

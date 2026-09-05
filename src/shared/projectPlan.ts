import { z } from 'zod';

export const nativeProjectId = z.string().regex(/^project-[a-f0-9]{12}$/);
const milestone = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,48}$/),
  title: z.string().trim().min(1).max(180),
  validated: z.boolean(),
  note: z.string().trim().max(500),
}).strict();
const validNotes = (items: { validated: boolean; note: string }[]) => items.every((m) => !m.validated || m.note.length > 0);
const uniqueIds = (items: { id: string }[]) => new Set(items.map((m) => m.id)).size === items.length;

export const planDraftSchema = z.object({
  objective: z.string().trim().min(1).max(700),
  milestones: z.array(milestone).min(1).max(12).refine(validNotes).refine(uniqueIds),
}).strict();
export const projectPlanSchema = z.object({
  projectName: z.string().trim().min(1).max(160).optional(),
  objective: z.string().trim().min(1).max(700),
  milestones: z.array(milestone.extend({
    validatedAt: z.string().datetime().optional(),
    validatedBy: z.enum(['owner', 'local-check']).optional(),
  })).min(1).max(12).refine(validNotes).refine(uniqueIds).refine((items) => items.every((m) =>
    m.validated ? Boolean(m.validatedAt && m.validatedBy) : !m.validatedAt && !m.validatedBy)),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime(),
}).strict();
export const planWriteSchema = z.object({ projectId: nativeProjectId, revision: z.number().int().min(0), plan: planDraftSchema }).strict();
export type PlanDraft = z.infer<typeof planDraftSchema>;
export type ProjectPlan = z.infer<typeof projectPlanSchema>;
export type ProjectPlansById = Record<string, ProjectPlan>;

import { z } from 'zod';
import { EVIDENCE_TYPES, STATUSES } from './statuses.js';

export const statusSchema = z.enum(STATUSES);
export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);

const idSchema = z.string().min(1);

const relativeRepoPathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p), {
    message: 'evidence repo path must be relative to the village.yaml file',
  })
  .refine((p) => !p.split(/[\\/]/).includes('..'), {
    message: 'evidence repo path must not traverse upward',
  });

const commitEvidenceSchema = z.object({
  type: z.literal('commit'),
  repo: relativeRepoPathSchema,
  sha: z.string().min(1),
  note: z.string().optional(),
});

const humanReviewEvidenceSchema = z.object({
  type: z.literal('human_review'),
  reviewer: z.string().min(1),
  state: z.enum(['approved', 'pending']),
  note: z.string().optional(),
});

// Represented in V1 but never executed; verification returns `not_checked_v1`.
const referencedEvidenceSchema = z.object({
  type: z.enum(['test', 'pr_merged', 'deployed', 'observed']),
  ref: z.string().min(1),
  note: z.string().optional(),
});

export const evidenceSchema = z.discriminatedUnion('type', [
  commitEvidenceSchema,
  humanReviewEvidenceSchema,
  referencedEvidenceSchema.extend({ type: z.literal('test') }),
  referencedEvidenceSchema.extend({ type: z.literal('pr_merged') }),
  referencedEvidenceSchema.extend({ type: z.literal('deployed') }),
  referencedEvidenceSchema.extend({ type: z.literal('observed') }),
]);

export const subtaskSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  status: statusSchema.optional(),
  evidence: z.array(evidenceSchema).default([]),
});

export const taskSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  owner: z.string().optional(),
  status: statusSchema.optional(),
  blockedReason: z.string().optional(),
  nextAction: z.string().optional(),
  resumeHint: z.string().optional(),
  subtasks: z.array(subtaskSchema).default([]),
  evidence: z.array(evidenceSchema).default([]),
});

export const featureSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  tasks: z.array(taskSchema).default([]),
});

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  objective: z.string().min(1),
  features: z.array(featureSchema).default([]),
  tasks: z.array(taskSchema).default([]),
});

export const activityMappingSchema = z.object({
  match: z.string().min(1),
  taskId: idSchema,
});

export const workspaceSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    projects: z.array(projectSchema),
    activity_mapping: z.array(activityMappingSchema).optional(),
  })
  .superRefine((workspace, ctx) => {
    const seen = new Set<string>();
    const check = (id: string, path: (string | number)[]) => {
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate id "${id}"`,
          path,
        });
      }
      seen.add(id);
    };
    const checkTask = (task: z.infer<typeof taskSchema>, path: (string | number)[]) => {
      check(task.id, [...path, 'id']);
      task.subtasks.forEach((subtask, s) => check(subtask.id, [...path, 'subtasks', s, 'id']));
    };
    workspace.projects.forEach((project, p) => {
      check(project.id, ['projects', p, 'id']);
      project.features.forEach((feature, f) => {
        check(feature.id, ['projects', p, 'features', f, 'id']);
        feature.tasks.forEach((task, t) =>
          checkTask(task, ['projects', p, 'features', f, 'tasks', t]),
        );
      });
      project.tasks.forEach((task, t) => checkTask(task, ['projects', p, 'tasks', t]));
    });
  });

export type Evidence = z.infer<typeof evidenceSchema>;
export type Subtask = z.infer<typeof subtaskSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ActivityMapping = z.infer<typeof activityMappingSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;

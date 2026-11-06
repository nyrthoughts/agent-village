/**
 * Synthetic demo workers for the village scene.
 * These are clearly fictional and never imply access to real user sessions.
 * Claude app and Claude Code CLI are distinct tools with separate collectors.
 */
import type { Worker, WorkerTool } from '../../shared/activity.js';

export const DEMO_LABEL = 'Demo data \u2014 not connected to live sessions';

export interface DemoWorker extends Worker {
  demoProject: string;
  demoSummary: string;
}

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

export const DEMO_WORKERS: DemoWorker[] = [
  {
    id: 'demo-codex-1',
    tool: 'codex' as WorkerTool,
    role: 'lead',
    state: 'working',
    title: 'Codex on atlas contours',
    lastActivityAt: ago(2),
    attachedTaskId: 'atlas-contours',
    demoProject: 'atlas',
    demoSummary: 'Ajout de l\u2019autocompl\u00E9tion contextuelle multi-fichiers.',
    activityEvidence: { level: 'confirmed', source: 'codex-index', observedAt: ago(1) },
  },
  {
    id: 'demo-codex-2',
    tool: 'codex' as WorkerTool,
    role: 'lead',
    state: 'working',
    title: 'Codex deploy pipeline',
    lastActivityAt: ago(31),
    attachedTaskId: 'atlas-weather-site',
    demoProject: 'atlas',
    demoSummary: 'D\u00E9ploiement v0.8.3 en production.',
    activityEvidence: { level: 'recent', source: 'codex-index', observedAt: ago(30) },
  },
  {
    id: 'demo-claude-1',
    tool: 'claude' as WorkerTool,
    role: 'lead',
    state: 'working',
    title: 'Claude app memory refactor',
    lastActivityAt: ago(12),
    attachedTaskId: 'atlas-observatory',
    demoProject: 'atlas',
    demoSummary: 'Refonte du syst\u00E8me de m\u00E9moire \u00E0 long terme.',
    activityEvidence: { level: 'confirmed', source: 'claude-journal', observedAt: ago(10) },
  },
  {
    id: 'demo-claude-2',
    tool: 'claude' as WorkerTool,
    role: 'lead',
    state: 'idle',
    title: 'Claude ticket analysis',
    lastActivityAt: ago(45),
    attachedTaskId: 'beacon-garden-journal',
    demoProject: 'beacon',
    demoSummary: 'Analyse de 42 nouveaux tickets compl\u00E9t\u00E9e.',
  },
  {
    id: 'demo-openclaw-1',
    tool: 'openclaw' as WorkerTool,
    role: 'lead',
    state: 'working',
    title: 'OpenClaw integration tests',
    lastActivityAt: ago(18),
    attachedTaskId: 'beacon-relay-hub',
    demoProject: 'beacon',
    demoSummary: 'Tests d\u2019int\u00E9gration ajout\u00E9s pour API outils.',
    activityEvidence: { level: 'confirmed', source: 'openclaw-hook', observedAt: ago(16) },
  },
  {
    id: 'demo-forge-1',
    tool: 'other' as WorkerTool,
    role: 'lead',
    state: 'working',
    title: 'Forge runtime merge',
    lastActivityAt: ago(25),
    attachedTaskId: 'atlas-bridge',
    demoProject: 'atlas',
    demoSummary: 'Fusion de la feature "runtime isol\u00E9" en main.',
    activityEvidence: { level: 'recent', source: 'openclaw-hook', observedAt: ago(24) },
  },
  {
    id: 'demo-claude-helper',
    tool: 'claude' as WorkerTool,
    role: 'helper',
    parentId: 'demo-claude-1',
    state: 'waiting',
    title: 'Claude sub-agent review',
    lastActivityAt: ago(15),
    attachedTaskId: 'atlas-observatory',
    demoProject: 'atlas',
    demoSummary: 'En attente de revue.',
  },
];

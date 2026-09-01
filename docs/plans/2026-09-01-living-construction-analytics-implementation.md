# Living Construction and Agent Analytics Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every task visibly build through six evidence-backed stages, add eight stable architectural families, render lead/helper people, and expose honest clickable task and agent analytics.

**Architecture:** Derive construction progress and rollups exclusively in the server truth layer. Extend activity providers additively with provider-honest roles and capabilities. Keep the semantic React/CSS map, compose family and stage attributes, and use separate task and worker dialogs without adding a game engine or persistence layer.

**Tech Stack:** TypeScript, React 18, CSS pixel art, Zod, Vitest, Testing Library, Playwright.

---

### Task 1: Evidence-backed construction progress

**Files:**
- Modify: `src/shared/statuses.ts`
- Modify: `src/server/truth/derive.ts`
- Modify: `src/server/truth/derive.test.ts`
- Modify fixtures in client tests that construct derived objects

**Step 1: Write failing derivation tests**

Cover zero-subtask tasks, partial verified subtasks, blocked work retaining its built stage, and the roof gate. Assert rollups on features, projects, and workspace.

**Step 2: Verify RED**

Run: `npm test -- --run src/server/truth/derive.test.ts`

Expected: FAIL because `progress` does not exist.

**Step 3: Implement the truth contract**

Add `CONSTRUCTION_STAGES`, `ConstructionStage`, `TaskProgress`, and `ProgressRollup`. Derive stages as follows:

```ts
if (roof) stageIndex = 5;
else if (verifiedLeaves === 0) stageIndex = effectiveStatus === 'planned' ? 0 : 1;
else stageIndex = 1 + Math.min(3, Math.ceil(verifiedLeaves * 3 / totalLeaves));
```

For tasks without subtasks, use the task itself as one leaf. Completion remains impossible without `roof`.

**Step 4: Verify GREEN**

Run: `npm test -- --run src/server/truth/derive.test.ts && npm run typecheck`

Expected: PASS.

### Task 2: Stable eight-family construction sprites

**Files:**
- Create: `src/client/scene2d/buildingFamilies.ts`
- Create: `src/client/scene2d/buildingFamilies.test.ts`
- Modify: `src/client/scene2d/PixelBuilding.tsx`
- Modify: `src/client/scene2d/PixelBuilding.test.tsx`
- Modify: `src/client/styles/scene.css`

**Step 1: Write failing family and building tests**

Assert eight family IDs, stable hash assignment when task order changes, `data-family`, `data-stage`, six distinguishable stage hooks, and unchanged semantic selection.

**Step 2: Verify RED**

Run: `npm test -- --run src/client/scene2d/buildingFamilies.test.ts src/client/scene2d/PixelBuilding.test.tsx`

Expected: FAIL because the registry and stage attributes do not exist.

**Step 3: Implement composition**

Create a typed family registry with palette tokens and stable task-ID hashing. Render the same nested building parts for every family and expose server-derived stage. CSS hides/reveals lot, foundation, frame, walls, roof, and completion details while status marks remain overlays.

**Step 4: Verify GREEN**

Run: `npm test -- --run src/client/scene2d/buildingFamilies.test.ts src/client/scene2d/PixelBuilding.test.tsx src/client/scene2d/VillageMap2D.test.tsx && npm run typecheck`

Expected: PASS.

### Task 3: Provider-honest agent hierarchy

**Files:**
- Modify: `src/shared/activity.ts`
- Modify: `src/server/activity/codexProvider.ts`
- Modify: `src/server/activity/codexProvider.test.ts`
- Modify: `src/server/activity/claudeHooks.ts`
- Modify: `src/server/activity/claudeHooks.test.ts`
- Modify: `src/server/activity/hookStore.ts`
- Modify: `src/server/activity/hookStore.test.ts`
- Modify activity fixtures in tests

**Step 1: Write failing provider tests**

Assert Codex preserves source kind and maps subagent sources to helper. Assert Claude hook installation includes `SubagentStart` and `SubagentStop`, helper ingestion uses `agent_id` plus parent session, and ending a session removes helpers.

**Step 2: Verify RED**

Run: `npm test -- --run src/server/activity/codexProvider.test.ts src/server/activity/claudeHooks.test.ts src/server/activity/hookStore.test.ts`

Expected: FAIL on missing role and events.

**Step 3: Implement additive contracts**

Add `WorkerRole`, default unknown roles, optional parent/first-seen fields, and snapshot capabilities. Do not add token or cost fields. Keep provider payload allowlists and redaction.

**Step 4: Verify GREEN**

Run the focused provider tests and `npm run typecheck`.

### Task 4: Clickable people and honest analytics

**Files:**
- Modify: `src/client/scene2d/PixelWorker.tsx`
- Modify: `src/client/scene2d/PixelWorker.test.tsx`
- Modify: `src/client/scene2d/VillageMap2D.tsx`
- Modify: `src/client/scene2d/VillageMap2D.test.tsx`
- Create: `src/client/drawer/WorkerDrawer.tsx`
- Create: `src/client/drawer/WorkerDrawer.test.tsx`
- Modify: `src/client/drawer/DetailDrawer.tsx`
- Modify: `src/client/drawer/DetailDrawer.test.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`
- Modify: `src/client/styles/scene.css`

**Step 1: Write failing interaction tests**

Assert lead sprites are adult-sized buttons, helpers are smaller buttons, helper count is grouped above the lead, no accessible text says child/kid, people and houses open distinct dialogs, and unavailable metrics never render numeric zero.

**Step 2: Verify RED**

Run the focused client tests.

**Step 3: Implement dialogs and placement**

Use a discriminated selection union in App. Place people on path spurs outside building buttons. Task dialog shows stage, verified/remaining leaves, assigned agents, and explicit unavailable token/time rows. Worker dialog shows provider, state, role, project, task, first/last seen, helper count, and unavailable analytics.

**Step 4: Verify GREEN**

Run all focused client tests and typecheck.

### Task 5: Browser proof, independent review, and publication

**Files:**
- Modify: `e2e/desktop.spec.ts`
- Modify: `e2e/mobile.spec.ts`
- Modify: `e2e/reduced-motion.spec.ts`
- Replace: `docs/preview-desktop.png`
- Replace: `docs/preview-mobile.png`

**Step 1: Extend E2E proof**

Verify eight families across eight tasks, six-stage data, lead/helper counts, separate worker and house clicks, explicit unavailable analytics, 44 px targets, mobile overflow, and reduced motion.

**Step 2: Capture and inspect previews**

Capture 1440 × 1000 and 390 × 844. Confirm visible construction stages, people, count bubbles, and non-overlapping targets.

**Step 3: Run the full gate**

Run:

```bash
npm run typecheck
npm test -- --run
npm run build
node scripts/check-clean.mjs
npm audit --audit-level=high
npm run e2e
git diff --check
```

**Step 4: Perform independent Codex review**

Inspect the complete diff against the design, provider privacy tests, truth/activity boundary, visual evidence, and every completion criterion. Fix all blocking findings.

**Step 5: Push and clean**

Push only `design/emerald-village-v4`, verify its remote SHA, keep `main` unchanged, do not deploy, stop the preview server, and remove all temporary clones and captures.

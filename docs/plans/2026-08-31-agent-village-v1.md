# Agent Village V1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a public-ready local application that turns evidence-backed project work into a living architect-table village while showing agent activity as a separate, non-authoritative overlay.

**Architecture:** Agent Village owns the truth plane (`village.yaml`, evidence verification, hierarchy and visual state). An AMC-compatible localhost sidecar is optional and consumed through one server-side adapter for the activity plane. The browser only talks to Agent Village; activity can disappear without changing progress.

**Tech Stack:** Node 20.19+, npm, React, TypeScript, Vite, SVG/DOM/CSS, `yaml`, `zod`, Vitest, React Testing Library and Playwright. Runtime dependencies are limited to `react`, `react-dom`, `yaml` and `zod`.

---

## Product invariants

- Workspace = village; project = district; feature = compound; task = building; subtask = floor/room; agent session = worker.
- Visual nesting stops at project → feature → task → subtask.
- Activity never modifies progress. Tokens, duration and tool-call volume are absent from the progress schema.
- A declared `verified` status without verified evidence renders as `in_progress` with an `unproven_claim` warning.
- Questions 1–3 are answerable without a click: project position, attention state and current owner/worker.
- Questions 4–5 are answerable in one click: conversation to resume and next action.
- V1 is local only. Tailscale deployment is documented but never executed in this goal.

## Repository shape

```text
agent-village/
├── LICENSE
├── NOTICE
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.server.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── index.html
├── .github/workflows/ci.yml
├── docs/{architecture.md,deployment.md,plans/}
├── fixtures/village.demo.yaml
├── fixtures/amc/{dashboard.nominal.json,dashboard.empty.json,dashboard.malformed.json}
├── scripts/{dev.mjs,check-clean.mjs}
├── e2e/{desktop.spec.ts,mobile.spec.ts,degraded.spec.ts,reduced-motion.spec.ts}
└── src/
    ├── shared/{statuses.ts,schema.ts,attention.ts}
    ├── server/
    │   ├── {index.ts,router.ts,static.ts,mode.ts}
    │   ├── config/load.ts
    │   ├── truth/{derive.ts,evidence/{verify.ts,commit.ts,humanReview.ts}}
    │   └── activity/{amcAdapter.ts,redact.ts,mapWorkers.ts}
    └── client/
        ├── {main.tsx,App.tsx}
        ├── api/client.ts
        ├── hooks/{usePolling.ts,useVillage.ts,useActivity.ts}
        ├── scene/{VillageTable.tsx,District.tsx,Compound.tsx,Building.tsx,Floor.tsx,Scaffold.tsx,Flag.tsx,Roof.tsx,Worker.tsx,buildingLayout.ts,layout.ts,animations.ts,DegradedBanner.tsx}
        ├── drawer/DetailDrawer.tsx
        ├── mobile/AttentionList.tsx
        └── styles/{tokens.css,scene.css}
```

Tests are colocated with implementation files. Every task follows red → green → verification → atomic commit.

## Closed schemas

```ts
export const STATUSES = [
  'planned',
  'in_progress',
  'awaiting_review',
  'blocked',
  'verified',
] as const;

export const EVIDENCE_TYPES = [
  'test',
  'commit',
  'pr_merged',
  'deployed',
  'observed',
  'human_review',
] as const;

export interface Workspace {
  version: 1;
  name: string;
  projects: Project[];
  activity_mapping?: ActivityMapping[];
}

export interface Project {
  id: string;
  name: string;
  objective: string;
  features: Feature[];
  tasks: Task[];
}

export interface Feature { id: string; title: string; tasks: Task[] }

export interface Task {
  id: string;
  title: string;
  owner?: string;
  status?: Status;
  blockedReason?: string;
  nextAction?: string;
  resumeHint?: string;
  subtasks: Subtask[];
  evidence: Evidence[];
}

export interface ActivitySnapshot {
  status: 'live' | 'demo' | 'degraded' | 'absent';
  fetchedAt: string;
  workers: Worker[];
}
```

AMC output is allowlisted to `id`, `tool`, `state`, `attachedTaskId`, `lastActivityAt` and optional redacted `title`. Messages, tokens, costs, paths and credentials never cross the adapter.

## Task 01 — Bootstrap the public-ready repository

**Files:** Create toolchain files, `LICENSE`, `NOTICE`, README skeleton, `src/shared/statuses.ts`, `src/shared/statuses.test.ts`, and inert CI workflow.

1. Write a test importing the three constant tuples and asserting their exact values.
2. Run `npm test -- run src/shared/statuses.test.ts`; expect a missing-module failure.
3. Add the minimal tuples, Node 20 configs, Vite/React entrypoint and Apache-2.0 files.
4. Run `npm run typecheck && npm test -- run`; expect green.
5. Commit: `chore: bootstrap agent-village`.

## Task 02 — Define the Zod schema and YAML loader

**Files:** Create `src/shared/schema.ts`, `src/server/config/load.ts`, their tests and a minimal `fixtures/village.demo.yaml`.

1. Add failing tests for a valid workspace, unknown status, unknown evidence type, duplicate ids, missing version, malformed YAML and absolute evidence repo paths.
2. Run the focused tests and confirm they fail.
3. Implement discriminated evidence unions and `loadWorkspace()` returning structured path-aware errors.
4. Run `npm test -- run src/shared src/server/config`.
5. Commit: `feat(truth): define village schema and yaml loader`.

## Task 03 — Derive effective status and attention

**Files:** Create `src/server/truth/derive.ts`, `src/shared/attention.ts` and tests.

1. Add failing tests for unproven claims, pending human review, invalid evidence, status dominance, fully verified roofs and stable attention ordering.
2. Implement pure derivation functions. The client must never recalculate status.
3. Run `npm test -- run src/server/truth src/shared`.
4. Commit: `feat(truth): derive evidence-backed progress`.

**Batch 1 exit:** Tasks 01–03 committed; typecheck and unit tests green; no UI or network integration started.

## Task 04 — Verify `commit` and `human_review` evidence

**Files:** Create `src/server/truth/evidence/{verify.ts,commit.ts,humanReview.ts}` and tests.

1. Test valid/invalid commits in hermetic temporary repos.
2. Test SHA rejection before any Git call using `/^[0-9a-f]{7,40}$/`.
3. Use `execFile`, never a shell. Resolve only repo paths relative to the YAML file.
4. Test approved, pending and invalid human reviews.
5. Return `not_checked_v1` for the four represented-but-unexecuted evidence types.
6. Verify and commit `feat(evidence): inspect commits and human reviews`.

## Task 05 — Build canonical fictional fixtures and hygiene gate

**Files:** Finalize `fixtures/village.demo.yaml`; add the three AMC fixtures and `scripts/check-clean.mjs`.

1. Model fictional workspace `Verdant Labs` with projects `Atlas` and `Beacon`.
2. Cover all statuses, nested features/tasks/subtasks, a standalone task, roof, scaffold, flag, unproven claim, simulated commit and three C/X/O workers.
3. Add a matrix test mapping ids to expected effective statuses.
4. Make `check-clean.mjs` fail on personal/company identifiers and absolute home paths.
5. Verify and commit `feat(demo): add canonical public fixture`.

## Task 06 — Serve the truth API and static app

**Files:** Create `src/server/{index.ts,router.ts,static.ts,mode.ts}`, `scripts/dev.mjs` and tests.

1. Test health, village snapshot, invalid config errors, API 404, SPA fallback, traversal rejection and `127.0.0.1` binding.
2. Implement the minimal Node `http` server. Dev topology: Vite 5173 proxies `/api` to Node 4180; verified mode: Node serves `dist` on 4180.
3. Verify and commit `feat(server): serve truth snapshot locally`.

## Task 07 — Adapt and redact AMC activity

**Files:** Create `src/server/activity/{amcAdapter.ts,redact.ts,mapWorkers.ts}` and tests.

1. Test nominal, empty, malformed and timed-out AMC responses using a fake local server.
2. Recursively assert that output contains no non-allowlisted key, message, token, cost or absolute path.
3. Map sessions to task ids through explicit substring mappings; unmatched sessions remain unassigned.
4. Use an 800 ms timeout and graceful degraded snapshots.
5. Verify and commit `feat(activity): add redacted AMC adapter`.

## Task 08 — Expose demo/live/truth-only activity modes

**Files:** Extend `mode.ts`, `router.ts` and tests.

1. Test demo fixture activity, live AMC failure and truth-only absence.
2. Assert `/api/village` is byte-equivalent before and after activity failure.
3. Verify and commit `feat(server): expose separated activity API`.

**Batch 2 exit:** Tasks 04–08 committed; truth and activity endpoints tested; no browser depends on AMC directly.

## Task 09 — Build the typed client data layer

**Files:** Create `src/client/api/client.ts`, hooks and tests.

1. Test 5 s polling, visibility pause/resume, unmount cleanup and last-known truth retention.
2. Inject fetch and scheduler; use fake timers.
3. Verify and commit `feat(client): add resilient polling layer`.

## Task 10 — Render the task building grammar

**Files:** Create `buildingLayout.ts`, `Building`, `Floor`, `Scaffold`, `Flag`, `Roof`, tokens and tests.

1. Test pure layout specs: material, in-progress frame and blueprint ghost floors.
2. Test blocked scaffold, review flag, verified roof, focusability and textual ARIA status.
3. Render warm paper/basswood SVG shapes without a game engine or per-project assets.
4. Verify and commit `feat(scene): render evidence-backed buildings`.

## Task 11 — Compose districts, compounds and animation budget

**Files:** Create `VillageTable`, `District`, `Compound`, `layout.ts`, `animations.ts` and tests.

1. Test project districts, feature compounds, standalone task buildings and stable attention order.
2. Assert no visual nesting below subtask.
3. Select at most three animated elements by attention score.
4. Verify and commit `feat(scene): compose the living architect table`.

## Task 12 — Overlay workers and degraded states

**Files:** Create `Worker`, `DegradedBanner`; extend `App` and tests.

1. Test C/X/O workers, waiting state, unassigned worker zone, demo badge, degraded banner, empty village and config errors.
2. Ensure zero workers render when activity is absent while buildings remain unchanged.
3. Verify and commit `feat(scene): overlay non-authoritative activity`.

## Task 13 — Add the construction-site detail drawer

**Files:** Create `DetailDrawer.tsx`; extend `App` and tests.

1. Test click/Enter opening, objective, evidence reasons, blocker, next action and resume hint.
2. Test Escape, focus restoration and `role="dialog"`.
3. Keep it read-only; no control endpoint or message body.
4. Verify and commit `feat(drawer): add one-click work context`.

## Task 14 — Add mobile attention list and accessibility gates

**Files:** Create `AttentionList.tsx`, responsive styles and tests.

1. Test attention order and shared drawer behavior at mobile widths.
2. Test keyboard order, textual equivalents, AA token pairs and reduced-motion behavior.
3. Verify and commit `feat(mobile): add accessible attention view`.

**Batch 3 exit:** Tasks 09–14 committed; complete UI works from fixtures; component and accessibility tests green.

## Task 15 — Verify real browser acceptance

**Files:** Create Playwright config and four e2e specs.

1. Desktop: two districts, scaffold, flag, workers and one-click drawer.
2. Mobile 390 px: attention list, no horizontal overflow, drawer reachable.
3. Truth-only: buildings remain, workers disappear, degraded copy is accurate.
4. Reduced motion: no looping animation.
5. Run `npm run build && npx playwright install chromium && npm run e2e`.
6. Commit `test(e2e): verify village acceptance flows`.

## Task 16 — Finish public documentation and final gates

**Files:** Complete `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/architecture.md`, `docs/deployment.md` and this plan.

1. Document local modes, YAML schema, security boundary, the AMC-compatible interface and Tailscale commands as unexecuted guidance.
2. Run, in order:
   - `npm run typecheck`
   - `npm test -- run`
   - `npm run build`
   - `npm run e2e`
   - `node scripts/check-clean.mjs`
3. Manually verify desktop and 390 px mobile views, one-click recovery context and network calls restricted to localhost.
4. Commit `docs: complete the open-source V1`.

## Explicitly deferred

- No database, WebSocket, authentication, plugins, multi-user support or active agent control.
- No Codbash integration, permission-prompt detection or AMC service installation.
- No execution of `test`, `pr_merged`, `deployed` or `observed` evidence in V1.
- No stale-proof reachability check, multi-workspace discovery or write endpoint.
- No theme system, i18n, Storybook, analytics, token metrics, pixel snapshots or game mechanics.
- No GitHub publication, external deployment or Tailscale execution in this goal.

Any new idea goes to `docs/backlog.md`, not V1 code.

## Completion record

- Fable 5 reviewed the implementation and visual hierarchy; all five findings were applied.
- Codex reviewed the final diff and found no blocking issue.
- TypeScript passed.
- Vitest passed 76 tests across 22 files.
- Vite produced the production build.
- Playwright passed four Chromium acceptance flows.
- The public-fixture hygiene gate passed.
- `npm audit` reported zero vulnerabilities.
- Desktop and 390 px mobile previews were inspected.
- No publication, external deployment, Tailscale command, or live agent connection was executed.

# Project Districts Implementation Plan

> **For Codex:** Execute the approved loop in this session, with bounded parallel ownership and independent review before publication.

**Goal:** Make the private village readable as an exploration game: project entrances lead to districts, explicit milestones become clickable construction sites, and characters communicate observed activity without inventing progress.

**Architecture:** Preserve the existing React scene, private Node observer, passkey gate and local project ledger. A client-only projection expands a selected project into a common house plus one parcel per saved milestone. No new collector, persistence layer, dependency or remote connection.

**Tech Stack:** Existing TypeScript, React, SVG/CSS, Vitest and Playwright.

---

## Approved design and limits

- Player loop: notice a change → inspect a construction site → understand the goal and next action → decide → see validated progress reflected in the world. Walking is optional.
- Overview: existing project entrances remain available. Enter a district with one explicit control; return to the overview without changing source data.
- District: common house uses existing aggregate construction phases. Each milestone has only a boolean validation, so its own parcel is unvalidated (`lot`) or validated (`complete`), never an invented intermediate stage.
- A selected parcel opens that exact milestone's title, note, provenance and the existing plan editor. Completion is not a deployment claim.
- Sessions are associated with projects, not milestones: characters remain by the common house. No inferred task assignment.
- Missing or stale activity evidence cannot animate native workers as working. Waiting, idle and unknown remain distinct. Decorative animals do not report agent activity.
- Preserve six original architectures, FR/EN, reduced motion, direct house clicks and private data boundaries. No economy, XP, new game engine or credential change.

## Task 1 — district projection and inspection (root)

Files: create `src/client/observedDistrict.ts` and its test; modify `ObservedProjects.tsx`, `ObservedProjects.test.tsx`, `ProjectPlanPanel.tsx`, its test, `observed-projects.css`, `project-plan.css`, `language.ts`.

1. Add failing tests for two projects with homonymous milestone IDs, one common house plus exactly N parcels, no-plan survey-only house, immutable source data and validation/reopening isolation.
2. Run `npm test -- --run src/client/observedDistrict.test.ts`; expect missing projection to fail.
3. Implement `milestoneTaskId(projectId, milestoneId)` as `${projectId}:${milestoneId}` and `projectDistrict(project)` as an immutable project projection. Preserve original aggregate common-house task and create milestone tasks with one validation leaf each.
4. Add district selection/return controls without removing existing one-click project details. Pass `district` to the map. Pass the selected milestone ID into the plan panel and highlight only its record.
5. Keep long reports in the existing journal and show the selected milestone above them. Preserve draft edits and conflict handling.
6. Run focused UI tests; expect navigation, exact parcel selection and all prior plan tests to pass.

## Task 2 — bounded district layout (CDO)

Files owned: `scene2d/villageLayout2d.ts`, its tests, `VillageMap2D.tsx`, its tests, `PixelBuilding.tsx`, building tests.

1. Add failing tests for explicit district layout: 1–13 plots (common house + up to 12 milestones), stable placement, no overlaps and reachable doors.
2. Add optional `district = false` to `VillageMap2D`; call `layoutVillage2d(village, district)` with a single projected project. Preserve overview/demo behavior.
3. Keep the common house's task ID equal to project ID so workers retain truthful placement. Vary milestone families deterministically without changing their shape on validation.
4. Use shared confirmed-working presentation for native activity accents, and no activity accent on unassigned milestone parcels.
5. Verify direct house clicks, walking, crowd limits and stage rendering remain correct.

## Task 3 — truthful character signals (CTO)

Files owned: new `shared/workerPresentation.ts` and tests; `scene2d/PixelWorker.tsx`, its tests, `worker-activity.css`.

1. Add failing tests: native worker working with absent/recent/expired/future evidence never animates; fresh confirmed working does; waiting stays visibly waiting; demo retains explicitly fictional activity.
2. Export `isConfirmedWorking(worker, now = Date.now())` and `presentWorkerState(worker, native, now = Date.now())`; apply to worker appearance. Map passes `native={observed}`.
3. Keep accessibility text consistent with the visible state and helper counts. Add a resting pose for waiting/idle without adding movement loops.
4. Run focused tests; review no secrets or data export were added.

## Task 4 — verification and push (root + independent reviewer)

1. Review each task against this spec, then independently review code quality/privacy and fix findings.
2. Run `npm run typecheck`, `npm test -- --run`, `npm run build`, `node scripts/check-clean.mjs`, and `npm run e2e`.
3. Verify real repository visibility/remote and that only source, tests, docs and fictional fixtures are staged. Preserve the localhost runtime and owner credentials.
4. Push reviewed code to `nyrthoughts/agent-village`; no force push. Verify remote SHA and applicable CI. Do not call this private Internet deployment or create a machine token.

## Progress

- [x] Approved game loop and source audit; baseline 248 tests pass.
- [x] District projection and exact milestone inspection.
- [x] Bounded layout and stable building families.
- [x] Truthful native character presentation, including expiration during failed polls.
- [x] Independent specification and quality reviews. Clock freshness, keyboard focus, recent-helper count and demo confirmation findings resolved.
- [x] Publication gates: 298 unit tests, 14 Chrome E2E, typecheck, build, public-fixture hygiene and dependency audit pass.

## Delivery boundary

The reviewed source is ready for the authorized GitHub push. Publishing the public demo does not expose the private observer. This lot does not add the remote synchronization bridge or create its machine credential.

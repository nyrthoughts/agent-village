# Living Project Village implementation plan

**Goal:** Make the native owner-only village genuinely useful: stable project goals, explicit milestone progress reflected in unfinished buildings, truthful parent/helper counts, immediate walking and a distinctive living village.

**Architecture:** Keep the existing React/SVG scene and loopback observer. Store owner-defined project plans in a small private JSON ledger outside the repository, behind the existing passkey session. Conversation activity never becomes completion evidence. Preserve the public fictional demo/private native boundary.

**Tech stack:** TypeScript, React, Node HTTP, Zod, Vitest, Playwright; no added engine or cloud service.

## Scope and authority

User approved this corrective lot and requested autonomous completion. Implement, test, publish code and fictional demo, and update the existing private local runtime. Never publish private project plans, aliases, transcripts, credentials or real screenshots. Do not enroll a new owner, control agents, or change unrelated hooks.

## Phase 1 — native truth and usable project plans

- Root: private plan schema/store/API, overlay in `projectObserver.ts`, owner editor in `ObservedProjects.tsx`, progress UI, integration tests. Goals are explicit and stable; milestone validation is owner-declared with a note, not inferred from token usage. Unknown remains unknown. Persist across restart and reject unauthorized/stale/invalid writes.
- CTO: `localSessions.ts`, relevant activity shared types and datasource tests. Read bounded parent/child metadata, retain root project association, classify detected/recent/confirmed without equating an open edge with current work. Report hook coverage limits.
- Verify red/green tests for persistence, authorization, stable objective, actual stages and parent-child attribution.

## Phase 2 — visible construction and life

- CDO: `PixelBuilding.tsx` and building SVG helpers/tests, dedicated building CSS. Six genuinely different silhouettes: Japanese workshop, Moroccan courtyard, Dutch gable, Brazilian balcony, Greek terraces, Norwegian timber storehouse. Render actual foundations/frame/walls/roof from milestone stages. Undefined progress is explicitly distinct from completed.
- Game creator: `VillageMap2D.tsx`, player/pathfinding as needed, animal sprites and dedicated scene CSS/tests. Ground click walks immediately; house click opens immediately; keyboard/touch supported. Two original decorative animals, reduced-motion and offscreen pause. Preserve parent/helper semantics and available partial activity.
- Root owns shared translations and integration; coordinate interfaces without overlapping edits.

## Phase 3 — integrated verification and delivery

- Run typecheck, complete unit suite, build, hygiene, audit and Chrome desktop/mobile/auth E2E.
- Independently review privacy, progress truth and interactions. Inspect representative six-style and intermediate-stage screenshots.
- Preserve a private rollback of installed runtime; bundle and install without overwriting owner state, aliases or ingestion credentials.
- Verify installed build identity, anonymous denial and actual owner page where an existing session permits. If restart needs the owner's passkey, report that exact remaining interaction rather than claiming authenticated acceptance.
- Publish only reviewed source and fictional demo; verify CI and deployed commit. Close the goal only after acceptance evidence is recorded.

## Done evidence

- A goal and its milestone plan survive new conversations and server restart.
- Completing and reopening milestones changes the actual building stage; no plan never renders as verified completion.
- Parent/helper counts identify source and activity certainty.
- Ground walking needs no hidden mode; houses always open directly.
- Six silhouettes and two original animals are visible, with bounded animation.
- FR/EN and owner-only API tests pass; private files never enter the public repository.

## Progress

- [x] Scope approved; previous runtime audited; clean baseline identified (`851926b`).
- [x] Phase 1 implemented and tested.
- [x] Phase 2 implemented and tested.
- [x] Independent review and complete verification: 248 unit tests, 14 Chrome E2E, typecheck, hygiene and production audit pass. CTO found no remaining P1/P2 after fixes; CDO reviewed fictional desktop/mobile captures.
- [x] Private runtime updated and code/demo published at `8d04569`. CI run `33938207404` and Pages run `33938207403` succeeded. Installed bundle identity and anonymous read/write denial verified; owner enrollment preserved. A restart requires the owner's own passkey login, not fresh enrollment.

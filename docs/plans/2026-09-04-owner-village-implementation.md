# Owner Village Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the user-approved owner-authenticated local village, a clear source-backed briefing, an original polished visual scene, and optional click-to-walk avatar navigation, while keeping agent control and external inference disabled.

**Architecture:** Retain React and Node HTTP. A passkey gate protects native data before source collection; short-lived bearer sessions remain in memory. A compact deterministic briefing explicitly labels agent reports, and an authored tile layout supplies both rendered geometry and collision data to a small pathfinder.

**Tech Stack:** TypeScript, React, CSS pixel art, Node crypto, maintained WebAuthn verifier, Vitest and Playwright. No game engine, model download, remote transcript service or database.

## Four-role debate and decisions

- CPO (root): optimize time to informed action, never confuse waiting with a required human decision or activity with delivery. Direct project access remains available.
- CTO: APIs must fail closed, bootstrap cannot be first-visitor-wins, browser uses localhost RP rather than IP. Session cookies are not isolated by port, so use memory-only bearer; no agent-command routes.
- CDO: replace uniform grid and opaque overlays with an asymmetric village and calm editorial field journal. Distinct roof silhouettes, layered forest and shore, limited palette, readable text.
- Game creator: movement is optional; click destination, route around obstacles, arrive at house door then open; keyboard, stop/replacement, reduced motion. Polling must not reset movement.
- Resolution: consultation first, exploration optional. Three source-backed attention items maximum with honest empty state; six principal houses, others still searchable. Gameplay supplies delight, never a gate to information.

## Ownership and checkpoint

Four collaborators total including root. No nested agents. Independent file ownership prevents conflicts; each author preserves other edits. Runtime and private settings remain untouched until verification. User authority covers the agreed implementation and local update, not private data publication, extra spending or hosted inference. No global cleanup.

### Task 1: Owner authentication and ingestion isolation — CTO

Files: create `src/server/auth/*`, modify `src/server/router.ts`, `src/server/index.ts`, `src/server/activity/hookStore.ts`, Claude/OpenClaw integration and their tests; own dependency manifests.

1. Add tests that an unauthenticated native read never calls snapshot; wrong/expired/revoked sessions fail, challenge replay and second enrollment fail, ingestion cannot read.
2. Run targeted Vitest tests and observe failures before implementation.
3. Implement local owner-only enrollment with private single-use bootstrap, maintained WebAuthn verification including user verification, exact origin/RP validation and memory session expiration. Keep health minimal and public; configuration failure closes data APIs.
4. Authenticate hooks separately, allowlist supported events, bound store and requests; migrate only the known hook markers while preserving unrelated hooks. Secret stays out of argv/public code.
5. Run backend tests and typecheck; hand off endpoint contract, bootstrap procedure, and limitations to root. Do not deploy or commit others' work.

### Task 2: Gate and useful briefing — root/CPO

Files: `src/client/AuthGate.tsx`, `src/client/api/client.ts`, `src/client/main.tsx`, `src/client/ObservedProjects.tsx`, `src/client/language.ts`, `src/shared/projectBrief.ts`, related tests.

1. Write failing tests for auth gate (no children/data before authentication), canonical local origin, memory-only session and logout/401 clearing.
2. Implement a clear bilingual locked screen and enrollment/login instructions; browser incompatibility is explicit, not a weaker silent fallback. The owner's real passkey gesture cannot be automated on their behalf.
3. Add a brief three-item attention view drawn from actual reported blockers/next steps and changes, honest absence, age and links. Keep original source text and direct project navigation.
4. Run `npx vitest run src/client src/shared/projectBrief.test.ts` and typecheck. Never label deterministic excerpts as LLM synthesis.

### Task 3: Authored visual direction — CDO

Files: `src/client/observed-projects.css`, scene CSS, `scene2d/PixelTerrain.tsx`, `PixelBuilding.tsx`, `villageLayout2d.ts`, `types.ts`; coordinate geometry contract with game creator.

1. Establish stable building placements and door/obstacle geometry for the native village; retain all projects across search/scope.
2. Implement original varied silhouettes, readable compact names, central gathering space, winding connected paths, depth of vegetation and shoreline. Avoid loading external assets/fonts or copying game sprites.
3. Style the quiet journal/sidebar and responsive screen, preserving semantic buttons and visible focus.
4. Verify layout tests and capture desktop/mobile; inspect rendered output for hierarchy, overflow and collision alignment.

### Task 4: Optional avatar navigation — game creator

Files: `scene2d/VillageMap2D.tsx`, new avatar/pathfinding files and tests; own avatar-specific CSS, not shared scene files.

1. Write failing path tests: every house door reachable, water/buildings/trees excluded, impossible destination rejected.
2. Implement deterministic four-direction grid search, avatar choice, optional visit mode, click/move/arrive/open, replace destination, Escape/Stop.
3. Separate camera drag and click, account for render scale, avoid reset on data poll, preserve instant keyboard/direct navigation and reduced-motion mode.
4. Add component/E2E tests including mobile and destination replacement.

### Task 5: Integration and final review — root then independent reviewer

1. Verify spec compliance before code quality; resolve blocking findings with the responsible author.
2. Run `npm run typecheck`, `npx vitest run`, `npm run build`, `node scripts/check-clean.mjs`, and `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_PORT=4192 npm run e2e`.
3. Exercise real verifier with a virtual authenticator in isolated tests. Validate session expiry/replay/unknown credential and absence of control routes.
4. Inspect desktop 1440×1000 and mobile 390×844 screenshots. Confirm no external requests carrying transcript data.
5. Back up the exact installed runtime/config to a bounded private rollback folder, update only approved runtime files and known hook markers. Restart only Agent Village, not agents.
6. Check actual unauthenticated APIs deny access; present enrollment privately to the owner. Do not claim owner enrollment is complete until their gesture succeeds.
7. Publish only reviewed code and fictional demo if in scope; never bootstrap, owner state, logs or screenshots with private reports. Finish only with verified scope or clearly identified user-dependent enrollment step.

## Remaining outside the approved tranche

Remote LLM synthesis, transcript transfer, model downloads, remote hosting/tunnels, and agent control. The original request for richer summaries remains documented, not silently replaced with extractive text; the user explicitly approved this implementation tranche with external inference off.

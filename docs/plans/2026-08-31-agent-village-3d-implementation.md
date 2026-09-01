# Agent Village True 3D Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the frontal 2.5D table with a true isometric Three.js village while preserving evidence-backed state, activity separation, accessibility, mobile recovery context, and the existing drawer.

**Architecture:** A single React-owned Three.js canvas renders deterministic district plots, procedural task buildings, and worker markers. Pure layout and building-spec modules translate existing derived truth into render instructions; Three.js never derives progress. Semantic HTML buttons are projected over the scene, and the existing 2.5D table remains the WebGL fallback.

**Tech Stack:** React 18, TypeScript, Three.js 0.185, orthographic WebGL, DOM overlays, Vitest, React Testing Library, Playwright.

---

## Product invariants

- The server schema, evidence verifiers, derived statuses, APIs, and activity adapter do not change.
- Camera azimuth and elevation are fixed. Users may pan and zoom, never rotate.
- Project = district plot; feature = compound; task = building; subtask = floor; session = worker.
- Buildings must remain unchanged when activity fails.
- Every building remains reachable by keyboard and readable without interpreting canvas pixels.
- Mobile shows the 3D panorama before the existing attention lists.
- No physics, imported models, game engine, persistence, or agent-control endpoint.

## Task 01 — Add Three.js and close the pure 3D scene model

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/client/scene3d/types.ts`
- Create: `src/client/scene3d/layout3d.ts`
- Create: `src/client/scene3d/layout3d.test.ts`

**Step 1: Write the failing layout tests**

Test that `layoutVillage3d()`:

```ts
const layout = layoutVillage3d(village);
expect(layout.districts.map((district) => district.projectId)).toEqual(['atlas', 'beacon']);
expect(layout.buildings.map((building) => building.taskId)).toEqual(expect.arrayContaining([
  'atlas-bridge', 'atlas-contours', 'beacon-lens',
]));
expect(new Set(layout.buildings.map(({ x, z }) => `${x}:${z}`)).size)
  .toBe(layout.buildings.length);
```

Add a second test calling the function twice and asserting strict equality. Add a third test confirming feature tasks carry a `compoundId` and standalone tasks do not.

**Step 2: Run the focused test and verify red**

Run: `npm test -- --run src/client/scene3d/layout3d.test.ts`

Expected: FAIL because `layout3d.ts` does not exist.

**Step 3: Add the dependency and minimal pure implementation**

Run: `npm install three@^0.185.1 && npm install --save-dev @types/three@^0.185.4`

Define explicit render records:

```ts
export interface BuildingPlacement {
  taskId: string;
  projectId: string;
  compoundId?: string;
  x: number;
  z: number;
  rotationY: number;
}

export interface DistrictPlacement {
  projectId: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface VillageLayout3d {
  districts: DistrictPlacement[];
  buildings: BuildingPlacement[];
  width: number;
  depth: number;
}
```

Use array order and fixed constants only. Place districts in a two-column grid, compounds in rows, and tasks in three-column micro-grids. Do not use randomness or status in placement.

**Step 4: Run tests and typecheck**

Run: `npm test -- --run src/client/scene3d/layout3d.test.ts && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```sh
git add package.json package-lock.json src/client/scene3d
git commit -m "feat(scene3d): define deterministic village layout"
```

## Task 02 — Define the procedural building grammar

**Files:**
- Create: `src/client/scene3d/buildingSpec.ts`
- Create: `src/client/scene3d/buildingSpec.test.ts`
- Create: `src/client/scene3d/buildingFactory.ts`
- Create: `src/client/scene3d/materials.ts`

**Step 1: Write failing status-grammar tests**

For a task fixture per status, assert:

```ts
expect(buildingSpec(planned)).toMatchObject({ solidFloors: 0, ghostFloors: 1, roof: false });
expect(buildingSpec(active)).toMatchObject({ frameFloors: 1, roof: false });
expect(buildingSpec(blocked).scaffold).toBe(true);
expect(buildingSpec(review).flag).toBe(true);
expect(buildingSpec(verified).roof).toBe(true);
```

Test that subtask count becomes floor count with a visual cap of five and a minimum of one.

**Step 2: Verify red**

Run: `npm test -- --run src/client/scene3d/buildingSpec.test.ts`

Expected: FAIL because the module is missing.

**Step 3: Implement the pure specification**

Return only numbers and booleans from `buildingSpec()`. Preserve the existing effective status and subtask semantics; do not inspect evidence in this layer.

**Step 4: Build reusable Three.js groups**

`createBuildingGroup(task)` creates:

- box floors for verified material;
- narrow posts/beams for frames;
- transparent boxes and line outlines for blueprints;
- coral posts and crossbars for scaffold;
- one amber pole and cloth triangle for review;
- a two-slope roof from simple buffer geometry;
- `group.userData.taskId = task.id` on the root and pickable meshes.

Use shared cached geometries and materials. Add a `disposeBuildingResources()` helper only for resources owned by the factory.

**Step 5: Test geometry without WebGL**

Assert group names, task IDs, bounding-box height ordering, and expected marker children using Three.js scene objects in Node.

Run: `npm test -- --run src/client/scene3d/buildingSpec.test.ts && npm run typecheck`

Expected: PASS.

**Step 6: Commit**

```sh
git add src/client/scene3d
git commit -m "feat(scene3d): generate status-driven buildings"
```

## Task 03 — Add the fixed isometric camera controller

**Files:**
- Create: `src/client/scene3d/cameraController.ts`
- Create: `src/client/scene3d/cameraController.test.ts`

**Step 1: Write failing camera tests**

Test pure helpers first:

```ts
expect(clampZoom(0.2)).toBe(MIN_ZOOM);
expect(clampZoom(99)).toBe(MAX_ZOOM);
expect(cameraPositionFor({ x: 0, z: 0 }, 20)).toEqual({ x: 20, y: 18, z: 20 });
```

Test that drag deltas update only the target plane and never camera rotation. Test that resize updates orthographic bounds at both landscape and portrait aspect ratios.

**Step 2: Verify red**

Run: `npm test -- --run src/client/scene3d/cameraController.test.ts`

Expected: FAIL because the controller does not exist.

**Step 3: Implement the minimal controller**

Use `THREE.OrthographicCamera`. Keep a target `{x, z}`, a bounded zoom scalar, and fixed direction `[1, 0.9, 1]`. Attach pointer, wheel, and touch listeners to the canvas. Return a cleanup function that removes every listener.

Expose:

```ts
interface CameraController {
  camera: THREE.OrthographicCamera;
  updateViewport(width: number, height: number): void;
  project(world: THREE.Vector3, width: number, height: number): { x: number; y: number; visible: boolean };
  dispose(): void;
}
```

**Step 4: Verify green**

Run: `npm test -- --run src/client/scene3d/cameraController.test.ts && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```sh
git add src/client/scene3d/cameraController.ts src/client/scene3d/cameraController.test.ts
git commit -m "feat(scene3d): add fixed isometric camera"
```

## Task 04 — Render the living 3D village canvas

**Files:**
- Create: `src/client/scene3d/VillageScene3D.tsx`
- Create: `src/client/scene3d/sceneFactory.ts`
- Create: `src/client/scene3d/sceneFactory.test.ts`
- Create: `src/client/scene3d/workers3d.ts`
- Create: `src/client/scene3d/dispose.ts`

**Step 1: Write failing scene-assembly tests**

Build a scene from the demo-derived workspace and assert:

- one named district group per project;
- one named building group per task;
- feature fences for compounds;
- mapped workers parented beside the right building;
- no worker changes any building group or task status;
- unassigned workers occupy the staging group.

**Step 2: Verify red**

Run: `npm test -- --run src/client/scene3d/sceneFactory.test.ts`

Expected: FAIL because the assembly module is missing.

**Step 3: Implement scene assembly**

Create one warm ground plane, district slabs, low compound fences, procedural buildings, project plaques, worker markers, ambient light, one directional key light, restrained fog, and soft renderer shadows. Keep scene colors aligned with existing tokens.

`syncActivity(scene, activity)` may add, move, or remove worker groups only. It must never rebuild buildings.

**Step 4: Implement the React canvas lifecycle**

`VillageScene3D` should:

- create renderer, scene, camera, controller, raycaster, and resize observer once;
- rebuild static scene only when `village` changes;
- sync workers separately when `activity` changes;
- cap pixel ratio at `Math.min(devicePixelRatio, 1.75)`;
- pause its render loop while `document.hidden`;
- raycast on click and forward `{ task, trigger, project }` through the existing selection contract;
- dispose renderer, observers, listeners, animation frame, and owned resources on unmount.

**Step 5: Verify lifecycle behavior**

Mock `WebGLRenderer`, `ResizeObserver`, and `requestAnimationFrame` in a component test. Assert one setup, activity-only sync, selection forwarding, and complete cleanup.

Run: `npm test -- --run src/client/scene3d && npm run typecheck`

Expected: PASS.

**Step 6: Commit**

```sh
git add src/client/scene3d
git commit -m "feat(scene3d): render the living village"
```

## Task 05 — Add projected semantic labels and focus parity

**Files:**
- Create: `src/client/scene3d/SceneLabels.tsx`
- Create: `src/client/scene3d/SceneLabels.test.tsx`
- Modify: `src/client/scene3d/VillageScene3D.tsx`
- Modify: `src/client/styles/scene.css`

**Step 1: Write failing accessibility tests**

Render labels with a deterministic projector and assert:

```ts
expect(screen.getByRole('button', { name: /Timber bridge.*Blocked.*Owner Jo/i })).toBeVisible();
fireEvent.focus(screen.getByRole('button', { name: /Timber bridge/i }));
expect(onFocusTask).toHaveBeenCalledWith('atlas-bridge');
fireEvent.click(screen.getByRole('button', { name: /Timber bridge/i }));
expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'atlas-bridge' }), expect.any(HTMLButtonElement), expect.objectContaining({ id: 'atlas' }));
```

**Step 2: Verify red**

Run: `npm test -- --run src/client/scene3d/SceneLabels.test.tsx`

Expected: FAIL because labels do not exist.

**Step 3: Implement projected HTML controls**

Position buttons from building world anchors using `cameraController.project()`. Show short task names and status dots. Hide labels behind the camera or outside a padded viewport. Focus adds a Three.js highlight ring; blur removes it. The canvas remains `aria-hidden="true"`.

**Step 4: Style labels and scene chrome**

Add restrained basswood plaques, status colors, a pan/zoom hint, a reset-view button, a WebGL status region, and clear focus rings. Do not copy game HUD patterns or add resource counters.

**Step 5: Verify green**

Run: `npm test -- --run src/client/scene3d/SceneLabels.test.tsx && npm run typecheck`

Expected: PASS.

**Step 6: Commit**

```sh
git add src/client/scene3d src/client/styles/scene.css
git commit -m "feat(scene3d): project accessible building labels"
```

## Task 06 — Integrate WebGL fallback and mobile panorama

**Files:**
- Create: `src/client/scene3d/WebGLBoundary.tsx`
- Create: `src/client/scene3d/WebGLBoundary.test.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`
- Modify: `src/client/mobile/AttentionList.tsx`
- Modify: `src/client/styles/scene.css`

**Step 1: Write failing integration tests**

Test these contracts:

- WebGL available → `VillageScene3D` renders and old table is not primary.
- WebGL unavailable or context lost → existing `VillageTable` renders with “3D unavailable; showing accessible table.”
- Mobile DOM order → 3D panorama, then urgent list, then in-progress list.
- Scene and list open the same drawer.
- Degraded activity leaves the 3D building count and task statuses unchanged.

**Step 2: Verify red**

Run: `npm test -- --run src/client/App.test.tsx src/client/scene3d/WebGLBoundary.test.tsx`

Expected: FAIL because the boundary is missing.

**Step 3: Implement the boundary**

Detect WebGL with a temporary canvas before mounting Three.js. Catch renderer initialization and context loss. Keep `VillageTable` unchanged and render it only as fallback. Move `AttentionList` after the scene in `App` and use CSS to hide it on desktop while keeping both panorama and list on mobile.

**Step 4: Verify responsive layout**

Use a 16:9 desktop scene with a bounded minimum height. On 390 px, use a 320 px panorama, hide nonessential projected labels after the first priority tier, and preserve zero horizontal overflow.

**Step 5: Verify green**

Run: `npm test -- --run src/client && npm run typecheck`

Expected: PASS.

**Step 6: Commit**

```sh
git add src/client/App.tsx src/client/App.test.tsx src/client/mobile src/client/scene3d src/client/styles/scene.css
git commit -m "feat(scene3d): integrate responsive 3d experience"
```

## Task 07 — Verify true 3D browser behavior and visual quality

**Files:**
- Modify: `e2e/desktop.spec.ts`
- Modify: `e2e/mobile.spec.ts`
- Modify: `e2e/degraded.spec.ts`
- Modify: `e2e/reduced-motion.spec.ts`
- Create: `e2e/webgl-fallback.spec.ts`
- Replace: `docs/preview-desktop.png`
- Replace: `docs/preview-mobile.png`

**Step 1: Update failing browser expectations**

Assert:

- a WebGL canvas exists and has a non-empty rendered frame;
- at least two district plots and all demo building semantic buttons exist;
- selecting a projected building opens the drawer;
- wheel input changes the reported zoom within bounds;
- drag changes the camera target but not its fixed rotation;
- activity degradation removes workers without changing building count;
- 390 px shows canvas before `Needs attention` and has no horizontal overflow;
- reduced motion stops ambient animation;
- forced WebGL failure shows the old accessible table.

**Step 2: Run and verify red**

Run: `npm run e2e`

Expected: FAIL on the new 3D selectors before integration is complete.

**Step 3: Add only the test hooks needed for stable behavior checks**

Expose `data-scene-ready`, `data-building-count`, `data-worker-count`, `data-camera-zoom`, and `data-camera-azimuth`. Do not expose private scene objects globally.

**Step 4: Run browser acceptance**

Run: `npm run build && npm run e2e`

Expected: all Chromium tests PASS.

**Step 5: Regenerate and inspect previews**

Capture 1440×1000 and 390×844 full-page screenshots. Inspect both manually. The acceptance bar is that buildings read as volumes immediately, district boundaries remain legible, labels do not occlude priority buildings, and mobile retains the panorama.

**Step 6: Commit**

```sh
git add e2e docs/preview-desktop.png docs/preview-mobile.png
git commit -m "test(scene3d): verify true 3d acceptance"
```

## Task 08 — Update public documentation and run final gates

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/backlog.md`
- Modify: `SECURITY.md`
- Modify: `docs/plans/2026-08-31-agent-village-3d-implementation.md`

**Step 1: Update documentation**

Document Three.js as the only new runtime dependency, the fixed camera, WebGL fallback, canvas accessibility boundary, device-pixel-ratio cap, and unchanged truth/activity planes. Remove wording that describes the primary scene as 2.5D.

**Step 2: Run the complete verification sequence**

Run in order:

```sh
npm run typecheck
npm test -- --run
npm run build
npm run e2e
node scripts/check-clean.mjs
npm audit
git diff --check
```

Expected: every command exits 0 and `npm audit` reports zero vulnerabilities.

If macOS File Provider stalls Vitest workers in the Documents folder, copy the tracked tree to a temporary local directory, link an `npm ci` installation created from the same lockfile, and run the same commands there. Record that execution boundary precisely.

**Step 3: Perform the final review**

Review for renderer disposal, duplicate animation loops, stale closures, inaccessible canvas-only actions, activity/progress coupling, mobile overflow, excessive dependency weight, and accidental external network calls. Fix every blocking finding and rerun the affected gates.

**Step 4: Record completion and commit**

Add exact test counts and visual-review status to this plan's completion record, then:

```sh
git add README.md SECURITY.md docs
git commit -m "docs: complete the true 3d village"
```

## Explicitly deferred

- Free camera rotation, first-person mode, physics, collisions, avatars, imported GLTF assets, day/night cycles, sound, particles, and construction gameplay.
- Persistent camera state, historical playback, multi-user cursors, agent commands, approvals, and write endpoints.
- Physical building output remains a later adapter to the truth JSON, not part of this renderer revision.

## Completion record

- Completed locally on 2026-08-31; no deployment or external service was changed.
- Verification ran from an exact temporary copy because macOS File Provider intermittently stalled parallel reads in Documents.
- TypeScript checks passed; Vitest passed 95/95 tests across 29 files; Playwright passed 5/5 Chromium journeys.
- The production bundle built at 185.83 kB gzip, the public-fixture hygiene check passed, and `npm audit` found zero vulnerabilities.
- Desktop 1440×1000 and mobile 390×844 previews were inspected. Buildings read as volumes, both districts remain visible, mobile labels do not overlap, and the semantic fallback remains usable.

# Emerald Village Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Three.js diorama with a responsive, accessible, top-down pixel-art village inspired by Pokémon Emerald while preserving all manager truth and activity behavior.

**Architecture:** Add a deterministic pure 2D layout layer and semantic React map made from original CSS pixel art. Keep all server, schema, polling, activity, evidence, and drawer contracts unchanged; remove Three.js after the 2D map reaches parity.

**Tech Stack:** React 18, TypeScript, CSS, Vitest, Testing Library, Playwright, no new runtime dependency.

---

### Task 1: Deterministic 2D village layout

**Files:**
- Create: `src/client/scene2d/types.ts`
- Create: `src/client/scene2d/villageLayout2d.ts`
- Create: `src/client/scene2d/villageLayout2d.test.ts`

**Step 1: Write the failing layout tests**

Cover these exact behaviors:

```ts
const layout = layoutVillage2d(village);
expect(layout.width).toBe(64);
expect(layout.height).toBeGreaterThanOrEqual(40);
expect(layout.zones.map(({ projectId }) => projectId)).toEqual(['atlas', 'beacon']);
expect(layout.buildings.map(({ taskId }) => taskId)).toEqual([
  'atlas-contours', 'atlas-observatory', 'atlas-library', 'beacon-lens',
]);
expect(new Set(layout.buildings.map(({ x, y }) => `${x}:${y}`)).size)
  .toBe(layout.buildings.length);
expect(layoutVillage2d(village)).toEqual(layout);
```

Also assert that feature tasks retain `compoundId`, project zones touch the same route network, and ten tasks expand the world without overlap.

**Step 2: Run the test and verify RED**

Run: `npm test -- --run src/client/scene2d/villageLayout2d.test.ts`

Expected: FAIL because `villageLayout2d` does not exist.

**Step 3: Implement the minimal pure layout**

Define:

```ts
export interface PixelZone {
  projectId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  signX: number;
  signY: number;
}

export interface PixelBuildingPlacement {
  taskId: string;
  projectId: string;
  compoundId?: string;
  x: number;
  y: number;
  variant: number;
}

export interface PixelPath { x: number; y: number; width: number; height: number }

export interface VillageLayout2d {
  width: number;
  height: number;
  zones: PixelZone[];
  buildings: PixelBuildingPlacement[];
  paths: PixelPath[];
  entrance: { x: number; y: number };
}
```

Use a fixed 64-tile width, deterministic 2-column project placement, 6 × 5 tile building plots, and rectilinear shared paths. Derive all variation from array order; use no randomness or hashing.

**Step 4: Run the test and verify GREEN**

Run: `npm test -- --run src/client/scene2d/villageLayout2d.test.ts`

Expected: PASS.

### Task 2: Original status-specific pixel buildings

**Files:**
- Create: `src/client/scene2d/PixelBuilding.tsx`
- Create: `src/client/scene2d/PixelBuilding.test.tsx`

**Step 1: Write the failing building tests**

Render one building for each effective status and assert:

```ts
expect(screen.getByRole('button', {
  name: 'Contour studio. In progress. Mira.',
})).toHaveAttribute('data-building-variant', 'construction');
expect(screen.getByTestId('building-blocked')).toHaveAttribute('data-building-variant', 'blocked');
expect(screen.getByTestId('building-verified')).toHaveAttribute('data-building-variant', 'complete');
```

Assert that clicking forwards the original task, project, and button trigger. Assert visible text is a small sign or focus label rather than a permanent floating card.

**Step 2: Run the test and verify RED**

Run: `npm test -- --run src/client/scene2d/PixelBuilding.test.tsx`

Expected: FAIL because `PixelBuilding` does not exist.

**Step 3: Implement semantic CSS pixel structures**

Render a real button with original nested spans:

```tsx
<button className={`pixel-building pixel-building--${task.effectiveStatus}`}>
  <span className="pixel-building__shadow" />
  <span className="pixel-building__body">
    <span className="pixel-building__roof" />
    <span className="pixel-building__wall" />
    <span className="pixel-building__door" />
    <span className="pixel-building__window pixel-building__window--left" />
    <span className="pixel-building__window pixel-building__window--right" />
  </span>
  <span className="pixel-building__status-mark" />
  <span className="pixel-building__label">{task.title}</span>
</button>
```

Map `planned → plot`, `in_progress → construction`, `blocked → blocked`, `awaiting_review → review`, and `verified → complete`. Use variant index only for roof palette and building silhouette.

**Step 4: Run the test and verify GREEN**

Run: `npm test -- --run src/client/scene2d/PixelBuilding.test.tsx`

Expected: PASS.

### Task 3: Terrain, routes, zone signs, and original decorations

**Files:**
- Create: `src/client/scene2d/PixelTerrain.tsx`
- Create: `src/client/scene2d/PixelTerrain.test.tsx`

**Step 1: Write the failing terrain test**

Assert the terrain renders one shared ground, every path from layout, every project sign, and decorative families without copyrighted names:

```ts
expect(screen.getByTestId('pixel-ground')).toBeTruthy();
expect(screen.getAllByTestId('pixel-path')).toHaveLength(layout.paths.length);
expect(screen.getByText('Atlas')).toBeTruthy();
expect(screen.getByText('Beacon')).toBeTruthy();
expect(screen.getAllByTestId('pixel-tree').length).toBeGreaterThan(8);
expect(screen.getByTestId('pixel-pond')).toBeTruthy();
```

**Step 2: Run the test and verify RED**

Run: `npm test -- --run src/client/scene2d/PixelTerrain.test.tsx`

Expected: FAIL because `PixelTerrain` does not exist.

**Step 3: Implement a bounded decorative grammar**

Use deterministic arrays of tile coordinates for trees, flowers, rocks, fences, a pond, and the entrance. Paths are absolute rectangular tile runs; CSS supplies corners, texture, and outlines. Decorations are `aria-hidden` and must not create interaction targets.

**Step 4: Run the test and verify GREEN**

Run: `npm test -- --run src/client/scene2d/PixelTerrain.test.tsx`

Expected: PASS.

### Task 4: Agent sprites and activity truth separation

**Files:**
- Create: `src/client/scene2d/PixelWorker.tsx`
- Create: `src/client/scene2d/PixelWorker.test.tsx`

**Step 1: Write the failing worker tests**

Assert tool palette, state, mapping, and accessible activity text:

```ts
expect(screen.getByLabelText('Codex worker, working, Build contours')).toBeTruthy();
expect(screen.getByLabelText('Claude worker, waiting, Review Atlas')).toBeTruthy();
expect(screen.queryByText('Pokémon')).toBeNull();
```

**Step 2: Run the test and verify RED**

Run: `npm test -- --run src/client/scene2d/PixelWorker.test.tsx`

Expected: FAIL because `PixelWorker` does not exist.

**Step 3: Implement original two-frame sprites**

Build each character from CSS pixel blocks: hair/hat, face, body, legs, badge, and optional ellipsis bubble. Use `codex`, `claude`, `openclaw`, and `other` classes for palettes. Position mapped agents beside their building and unmapped agents at the entrance.

**Step 4: Run the test and verify GREEN**

Run: `npm test -- --run src/client/scene2d/PixelWorker.test.tsx`

Expected: PASS.

### Task 5: Interactive 2D game viewport

**Files:**
- Create: `src/client/scene2d/VillageMap2D.tsx`
- Create: `src/client/scene2d/VillageMap2D.test.tsx`

**Step 1: Write the failing viewport tests**

Cover:

- all task buttons and worker sprites render;
- absent/degraded activity renders zero workers without changing buildings;
- arrow keys and reset modify `data-camera-x` / `data-camera-y` within bounds;
- pointer drag changes the bounded camera;
- selecting a building forwards the correct task and project;
- world dimensions are exposed as `data-world-width` / `data-world-height`.

Example:

```ts
fireEvent.keyDown(map, { key: 'ArrowRight' });
expect(Number(map.dataset.cameraX)).toBeGreaterThan(0);
fireEvent.click(screen.getByRole('button', { name: 'Reset village view' }));
expect(map).toHaveAttribute('data-camera-x', '0');
```

**Step 2: Run the test and verify RED**

Run: `npm test -- --run src/client/scene2d/VillageMap2D.test.tsx`

Expected: FAIL because `VillageMap2D` does not exist.

**Step 3: Implement the viewport**

Compose `PixelTerrain`, `PixelBuilding`, and `PixelWorker`. Apply one transform to `.pixel-world`; clamp pan from measured viewport and logical world dimensions. Keep zoom fixed to CSS-responsive tile size. Add a focusable map region, reset button, and interaction hint.

**Step 4: Run the test and verify GREEN**

Run: `npm test -- --run src/client/scene2d/VillageMap2D.test.tsx`

Expected: PASS.

### Task 6: Integrate the 2D village and remove Three.js

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`
- Delete: `src/client/scene3d/`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Update App tests before production code**

Expect `Verdant Labs pixel village` and `data-testid="village-map-2d"`. Assert `village-scene-3d`, WebGL fallback text, summary cards, and Agent camp are absent. Preserve degraded and truth-only expectations.

**Step 2: Run App tests and verify RED**

Run: `npm test -- --run src/client/App.test.tsx`

Expected: FAIL because App still renders `VillageScene3D`.

**Step 3: Replace the scene boundary**

Render `VillageMap2D` directly inside the existing `game-stage`, keep `GameHud`, `DegradedBanner`, `AttentionList`, `DetailDrawer`, and empty state. Remove Three.js and `@types/three` with `npm uninstall three @types/three`. Delete obsolete 3D-only source and tests after parity tests exist.

**Step 4: Run focused and full unit tests**

Run: `npm test -- --run src/client/App.test.tsx src/client/scene2d`

Expected: PASS.

Run: `npm test -- --run`

Expected: all remaining suites PASS.

### Task 7: Emerald-inspired original visual system

**Files:**
- Replace: `src/client/styles/scene.css`
- Modify: `src/client/styles/tokens.css`
- Modify: `src/client/hud/GameHud.tsx`
- Modify: `src/client/hud/GameHud.test.tsx`
- Modify: `src/client/drawer/DetailDrawer.tsx`

**Step 1: Add testable visual hooks**

Assert the HUD exposes `data-ui-style="pixel-window"`, the drawer exposes `data-ui-style="field-menu"`, and the compact party control remains accessible.

**Step 2: Run tests and verify RED**

Run: `npm test -- --run src/client/hud/GameHud.test.tsx src/client/drawer/DetailDrawer.test.tsx`

Expected: FAIL on missing hooks.

**Step 3: Implement the visual system**

Use a limited original palette, hard 2–4 px outlines, off-white pixel windows, stepped shadows, zero blur, no glassmorphism, no gradients that simulate 3D, and no anti-aliased sprite transforms. Build all terrain and building art with CSS blocks and pseudo-elements. Make task labels appear on hover/focus/selection only. Use `image-rendering: pixelated` and reduced-motion overrides.

**Step 4: Run focused tests and typecheck**

Run: `npm test -- --run src/client/hud/GameHud.test.tsx src/client/drawer/DetailDrawer.test.tsx && npm run typecheck`

Expected: PASS.

### Task 8: Browser behavior and visual evidence

**Files:**
- Modify: `e2e/desktop.spec.ts`
- Modify: `e2e/mobile.spec.ts`
- Modify: `e2e/degraded.spec.ts`
- Modify: `e2e/reduced-motion.spec.ts`
- Delete: `e2e/webgl-fallback.spec.ts`
- Replace: `docs/preview-desktop.png`
- Replace: `docs/preview-mobile.png`

**Step 1: Update E2E assertions before the app**

Desktop must verify eight buildings, three workers, visible Atlas/Beacon signs, bounded pan/reset, and task drawer selection. Mobile must verify a readable first-viewport map, attention list below, no overflow, and task selection. Reduced motion must disable worker and water animation.

**Step 2: Run E2E and verify any stale assertions fail**

Run: `npm run e2e`

Expected: FAIL until all selectors and behavior match the 2D map.

**Step 3: Capture and inspect real screenshots**

Build and start the demo on an unused localhost port. Capture 1440 × 1000 and 390 × 844 screenshots with Playwright. Inspect both images manually. Correct illegible buildings, dashboard-like framing, non-integer scaling, clipped HUD, or overflow before accepting them.

**Step 4: Save approved evidence**

Replace `docs/preview-desktop.png`, `docs/preview-mobile.png`, and the workspace output previews with the inspected captures.

### Task 9: Final verification and branch publication

**Files:**
- Modify only files required by failures found below.

**Step 1: Run the complete verification gate**

Run:

```bash
npm run typecheck
npm test -- --run
npm run build
node scripts/check-clean.mjs
npm audit --audit-level=high
npm run e2e
```

Expected: every command exits 0, no high-severity audit finding, no fixture hygiene leak.

**Step 2: Inspect the diff**

Run: `git diff --check && git status --short`

Expected: only V4 design, plan, 2D scene, visual system, tests, dependency cleanup, and preview files are changed.

**Step 3: Commit and push with the repository workflow**

Run:

```bash
bash "$AGENT_SKILLS/git-pushing/scripts/smart_commit.sh" \
  "feat(design): build emerald-style pixel village"
```

Expected: branch `design/emerald-village-v4` is pushed and tracks origin.

**Step 4: Verify the remote and clean temporary state**

Verify the remote branch SHA via GitHub API, stop the preview server, and remove the temporary clone and intermediate captures. Do not deploy or merge.

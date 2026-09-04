# Organic RPG Tilemap Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the coarse V4 cross-road map with a compact, organic, original 16 px RPG village matching the approved reference density while preserving manager behavior.

**Architecture:** Extend the existing deterministic layout with typed organic path pieces and landmarks. Keep the semantic React task buttons and agent sprites, then compose a denser original tile vocabulary in CSS. No Canvas, game engine, runtime dependency, schema, API, or connector change.

**Tech Stack:** React 18, TypeScript, CSS pixel art, Vitest, Testing Library, Playwright.

---

### Task 1: Organic route and landmark layout

**Files:**
- Modify: `src/client/scene2d/types.ts`
- Modify: `src/client/scene2d/villageLayout2d.ts`
- Modify: `src/client/scene2d/villageLayout2d.test.ts`

**Step 1: Write the failing layout test**

Assert that paths expose `kind` values, no single route spans the full world height, the main square exists, and the layout exposes `pond` and `cliff` landmarks. Preserve determinism, task order, compound IDs, and non-overlapping task positions.

**Step 2: Run the test to verify RED**

Run: `npm test -- --run src/client/scene2d/villageLayout2d.test.ts`

Expected: FAIL because current paths have no kinds and landmarks do not exist.

**Step 3: Implement the minimal layout**

Add:

```ts
export type PixelPathKind = 'vertical' | 'horizontal' | 'square' | 'spur';
export interface PixelLandmark { kind: 'pond' | 'cliff'; x: number; y: number; width: number; height: number }
```

Build a short entrance route, a broad central square, offset horizontal streets, and small building spurs. Keep the fixed 64-tile world and deterministic two-column project zones.

**Step 4: Run tests and typecheck**

Run: `npm test -- --run src/client/scene2d/villageLayout2d.test.ts && npm run typecheck`

Expected: PASS.

### Task 2: Dense forest and authored terrain

**Files:**
- Modify: `src/client/scene2d/PixelTerrain.tsx`
- Modify: `src/client/scene2d/PixelTerrain.test.tsx`
- Modify: `src/client/styles/scene.css`

**Step 1: Write the failing terrain tests**

Assert at least 50 forest canopy sprites, one forest frame, every typed path, one pond, one cliff, project signs, and decorative prop families. Assert decorative elements remain hidden from assistive technology while project names remain readable.

**Step 2: Run the test to verify RED**

Run: `npm test -- --run src/client/scene2d/PixelTerrain.test.tsx`

Expected: FAIL on forest frame and cliff selectors.

**Step 3: Implement the original tile vocabulary**

Generate deterministic overlapping border-tree coordinates in TypeScript. Render typed route pieces, stepped path corners, deep/shallow pond tiles, a rocky raised edge, fences, flowers, rocks, lamps, and mailboxes. Use only CSS blocks and pseudo-elements aligned to the 16 px grid.

**Step 4: Run focused tests**

Run: `npm test -- --run src/client/scene2d/PixelTerrain.test.tsx`

Expected: PASS.

### Task 3: Compact detailed task houses

**Files:**
- Modify: `src/client/scene2d/PixelBuilding.tsx`
- Modify: `src/client/scene2d/PixelBuilding.test.tsx`
- Modify: `src/client/styles/scene.css`

**Step 1: Write the failing building test**

Assert every house declares `data-sprite-scale="compact"`, complete buildings expose a porch, and all five state variants retain their current semantic names and click behavior.

**Step 2: Run the test to verify RED**

Run: `npm test -- --run src/client/scene2d/PixelBuilding.test.tsx`

Expected: FAIL on the new compact sprite hook.

**Step 3: Implement compact original sprites**

Reduce visible footprints while keeping 44 px hit areas. Add roof shingles, stepped eaves, chimney, trim, porch, window highlights, mailbox/flag details, and three palette families. Keep planned, construction, blocked, review, and complete forms distinct.

**Step 4: Run focused tests and typecheck**

Run: `npm test -- --run src/client/scene2d/PixelBuilding.test.tsx src/client/scene2d/VillageMap2D.test.tsx && npm run typecheck`

Expected: PASS.

### Task 4: Map-first field HUD

**Files:**
- Modify: `src/client/hud/GameHud.tsx`
- Modify: `src/client/hud/GameHud.test.tsx`
- Modify: `src/client/styles/scene.css`

**Step 1: Write the failing HUD test**

Assert the party section exposes `data-layout="sprite-strip"` and the location plaque exposes `data-layout="location-plaque"` while all live-agent text remains accessible.

**Step 2: Run the test to verify RED**

Run: `npm test -- --run src/client/hud/GameHud.test.tsx`

Expected: FAIL on missing layout hooks.

**Step 3: Implement the smaller HUD**

Shrink the location plaque and display the agent party as a horizontal sprite strip. Hide long worker labels visually, not semantically. Keep completion and alert truth visible. Ensure neither panel covers task buildings at desktop or mobile widths.

**Step 4: Run focused tests**

Run: `npm test -- --run src/client/hud/GameHud.test.tsx src/client/App.test.tsx`

Expected: PASS.

### Task 5: Browser proof, publication, and cleanup

**Files:**
- Modify: `e2e/desktop.spec.ts`
- Modify: `e2e/mobile.spec.ts`
- Replace: `docs/preview-desktop.png`
- Replace: `docs/preview-mobile.png`

**Step 1: Extend E2E assertions**

Verify the forest frame, cliff, pond, organic path kinds, compact buildings, small HUD layouts, eight tasks, three workers, navigation/reset, drawer selection, mobile attention list, and no horizontal overflow.

**Step 2: Run E2E**

Run: `npm run e2e`

Expected: PASS after implementation.

**Step 3: Capture and inspect previews**

Capture 1440 × 1000 and full-page 390 × 844 screenshots. Reject rigid-cross composition, sparse isolated trees, oversized houses, or dominant HUD panels. Iterate until the map reads as an authored RPG village.

**Step 4: Run the full gate**

Run:

```bash
npm run typecheck
npm test -- --run
npm run build
node scripts/check-clean.mjs
npm audit --audit-level=high
npm run e2e
```

Expected: every command exits 0.

**Step 5: Commit, push, verify, and clean temporary state**

Use the repository smart commit workflow on `design/emerald-village-v4`. Verify the remote SHA, keep `main` untouched, do not deploy, stop the preview server, and remove the temporary clone and captures.

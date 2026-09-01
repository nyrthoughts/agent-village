# Agent Village — True 3D Scene Design

**Status:** Approved on 2026-08-31.

## Outcome

Replace the frontal 2.5D architect table with a true isometric 3D village where buildings are immediately visible as volumes. Preserve the evidence model, activity boundary, drawer, mobile attention list, and localhost-first architecture.

## Chosen approach

Use Three.js directly inside one React-owned canvas.

- CSS 3D was rejected because it would remain a visual illusion close to the current result.
- React Three Fiber was rejected for V1 because its additional abstraction and companion packages are unnecessary for this bounded scene.
- Direct Three.js provides real geometry, raycasting, an orthographic camera, and explicit lifecycle control with one production dependency.

No game engine, physics, free camera, terrain editor, asset pipeline, database, or new server contract is introduced.

## Camera and interaction

- Use an orthographic isometric camera with a fixed azimuth and elevation.
- Allow pointer drag to pan across the village.
- Allow wheel and pinch to zoom within strict minimum and maximum bounds.
- Do not allow camera rotation.
- Raycast clicks against building meshes and open the existing read-only detail drawer.
- Keep visible HTML labels and keyboard-accessible building buttons aligned to projected 3D positions.
- Reset the camera when the workspace identity changes.

## Spatial model

The existing hierarchy maps into a single scene:

```text
workspace → village ground plane
project   → district plot
feature   → fenced compound
task      → building
subtask   → floor
session   → worker marker
```

Districts use a stable deterministic grid. Compounds and standalone tasks occupy smaller plots inside their district. Layout is derived from IDs and array order so polling never causes buildings to jump.

## Building grammar

Buildings are generated from simple reusable geometry rather than external 3D assets.

| Effective state | Geometry and material |
| --- | --- |
| `planned` | translucent foundation footprint and dashed site outline |
| `in_progress` | completed lower floors plus exposed timber frame above |
| `blocked` | partial structure with coral scaffold and barrier marker |
| `awaiting_review` | constructed volume with amber flag |
| `verified` | finished walls, windows, and pitched roof |

Subtasks determine the number and state of floors. Tasks without subtasks receive one floor. Height is capped visually so large task trees remain readable. Existing status derivation remains authoritative; the renderer never recalculates progress.

## Workers and activity

Workers are small colored 3D markers positioned beside their mapped building. Tool identity remains C/X/O/other and state changes only appearance. Unassigned workers occupy a staging area. Activity failure removes workers but never changes buildings, geometry, or progress.

## Responsive behavior

- Desktop and tablet show the full 3D scene.
- Mobile shows a shorter interactive 3D panorama followed by the existing urgent and in-progress lists.
- The detail drawer remains shared across canvas, projected labels, and mobile list interactions.
- Device pixel ratio is capped and shadows are restrained for predictable performance.

## Accessibility and fallback

- The canvas is decorative to screen readers; an adjacent semantic task layer exposes every building as a button.
- Project, status, owner, and task title stay available as text.
- Keyboard focus on a task projects a visible highlight onto its building.
- Reduced motion disables ambient movement and animated worker signals.
- If WebGL initialization fails, the existing 2.5D scene remains available as a fallback.

## Component boundary

The 3D implementation stays behind a small client boundary:

- `VillageScene3D`: owns the canvas lifecycle and forwards selections.
- `sceneLayout3d`: pure deterministic district, compound, building, and worker positions.
- `buildingFactory`: creates and updates procedural building groups from derived task state.
- `cameraController`: fixed-angle pan, zoom, resize, and projection helpers.
- `SceneLabels`: semantic HTML buttons projected over buildings.
- `WebGLBoundary`: selects the 3D scene or existing fallback.

The server, YAML schema, evidence verifiers, APIs, polling hooks, and drawer contract do not change.

## Failure handling

- WebGL creation or context loss switches to the existing scene with a short textual notice.
- A malformed task cannot crash the scene because input has already passed the server schema and derivation layer.
- A polling failure retains the last known scene, as V1 already does.
- Resize and visibility listeners are removed on unmount.

## Verification

- Unit-test deterministic 3D layout, status-to-geometry specifications, zoom bounds, and cleanup.
- Component-test selection parity between semantic labels and the existing drawer.
- Browser-test building visibility, click selection, pan/zoom bounds, mobile composition, reduced motion, and WebGL fallback.
- Inspect desktop and 390 px screenshots manually.
- Re-run typecheck, all unit tests, production build, Playwright, hygiene, and dependency audit.

## Completion criteria

The revision is complete when a first-time viewer can recognize a village of volumetric buildings without explanation, distinguish the five work states, select any building, and recover the next action—without any new backend or control-plane infrastructure.

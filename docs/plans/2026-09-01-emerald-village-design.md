# Agent Village — Emerald Village Design

**Status:** Approved on 2026-09-01.

## Outcome

Replace the generic low-poly diorama with a genuine top-down pixel-art village inspired by the visual grammar of Pokémon Emerald. Preserve the evidence-backed manager, project hierarchy, activity overlay, detail drawer, APIs, and connection model.

The first screen must feel like a playable Game Boy Advance village before it feels like a dashboard.

## Chosen approach

Render the village as semantic React and CSS on a deterministic 16 px tile grid.

- DOM/CSS was chosen because it keeps tasks keyboard-accessible, produces crisp integer-scaled pixel art, and removes the runtime cost of Three.js from the primary experience.
- Canvas 2D was rejected because selection, focus, labels, and responsive accessibility would need a parallel semantic layer.
- Phaser and Pixi were rejected as unnecessary game-engine infrastructure for a read-only project map.

No physics, free-roaming player, map editor, asset marketplace, database, or new server contract is introduced.

## Original art rule

`pret/pokeemerald` and `pret/pokered` are structural references only. Do not copy, trace, bundle, or recolor their tiles, sprites, logos, characters, maps, or UI art.

Create a small original tileset and sprite grammar with:

- crisp nearest-neighbor scaling;
- compact 16 px logical tiles;
- saturated grass, cream paths, dark tree outlines, and bright water;
- front-facing houses with readable roofs, doors, signs, and shadows;
- original agent sprites distinguished by tool palette and badge.

## Camera and world

- Use a strict top-down view with no perspective, isometric transform, lighting engine, or 3D rotation.
- Place the world on a deterministic logical tile grid derived from project, feature, and task order.
- Show a cropped game viewport rather than shrinking the entire world into one screen.
- Support pointer drag, wheel, keyboard, and touch panning within bounded world limits.
- Scale the logical map by integer or near-integer steps and set `image-rendering: pixelated`.
- Reset the camera to the village entrance and active work area.

## Spatial model

```text
workspace → village map
project   → named zone connected by a route
feature   → local compound or street
task      → building or construction plot
subtask   → visible building stage
session   → agent sprite on a nearby path
```

Each project receives a contiguous zone rather than a floating island. Routes and vegetation connect zones into one believable town. Feature tasks cluster together; standalone project tasks use nearby open plots.

## Building grammar

| Effective state | Pixel-art representation |
| --- | --- |
| `planned` | marked dirt plot, stakes, and a rolled plan |
| `in_progress` | partial walls, timber frame, tools, and a short hammer animation |
| `blocked` | unfinished building with red pennant and barrier |
| `awaiting_review` | finished shell with amber inspection sign |
| `verified` | complete house with roof, door, windows, and a small completion sparkle |

Task titles remain available through signs, focus, and interaction rather than permanently floating over every building. A user selects a building to open the existing evidence drawer.

## Agents

Active conversations appear as original 16 × 24 px characters positioned on paths beside their mapped task.

- Codex, Claude, OpenClaw, and other tools use distinct palettes and a one-letter badge.
- `working` agents use a restrained two-frame work animation.
- `waiting` agents face the building and show a small ellipsis bubble.
- Unmapped agents wait near the village entrance.
- Activity failure removes agent sprites but never alters task truth or construction state.

## Game UI

Use a restrained Gen III-inspired interface, not a web dashboard:

- top-left location plaque with village name and completion bar;
- top-right compact party button showing visible agent count;
- bottom interaction hint on desktop only;
- pixel-window status legend that can collapse;
- existing detail drawer restyled as a game dialogue/menu panel;
- mobile attention list presented after the map as a field journal.

The map remains the dominant surface. No summary-card row or full-width agent panel returns.

## Responsive behavior

- Desktop shows a 4:3-style game viewport centered inside the available window, with additional width used for the world rather than stretched pixels.
- Mobile fills the first viewport with a closer crop, then exposes the existing attention list below.
- Buildings stay large enough to recognize; users pan to discover the rest of the village.
- Touch targets use invisible padding beyond the visible pixel sprite.

## Accessibility and fallback

- Every task building remains a real button with project, title, status, and owner in its accessible name.
- Panning supports arrow keys and a visible reset control.
- Reduced motion disables water, flowers, workers, tools, and completion sparkles.
- The semantic `VillageTable` remains the no-CSS/emergency fallback.
- Focus and selection never depend on color alone.

## Component boundary

- `VillageMap2D`: owns the viewport, pan bounds, and semantic task selection.
- `villageLayout2d`: pure deterministic zone, path, building, and worker positions.
- `PixelTerrain`: renders ground, paths, water, trees, flowers, fences, and signs.
- `PixelBuilding`: renders one status-specific original building.
- `PixelWorker`: renders one original agent sprite and state.
- `GameHud`: keeps the existing truth and activity summary with pixel-window styling.

Server files, YAML schema, evidence verification, status derivation, polling hooks, activity providers, connector scripts, and drawer data remain unchanged.

## Verification

- Unit-test deterministic layout and status-to-building variants.
- Component-test building selection, worker mapping, absent activity, keyboard panning, and reset.
- Browser-test crisp map rendering, task selection, bounded pan, mobile order, reduced motion, and no horizontal overflow.
- Inspect desktop and 390 px screenshots manually against the approved Emerald direction.
- Run typecheck, all unit tests, production build, Playwright, hygiene, and dependency audit.

## Completion criteria

The revision is complete when a first-time viewer identifies a colorful top-down pixel village without explanation, can locate projects and construction states, sees agents working near their tasks, opens task evidence in one action, and encounters no dashboard-first framing.

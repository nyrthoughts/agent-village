# Agent Village — Organic RPG Tilemap Design

**Status:** Approved on 2026-09-01.

## Outcome

Turn the existing pixel dashboard into a believable top-down RPG village. The approved references establish density and composition: compact detailed houses, irregular paths, dense forest borders, water and terrain edges, restrained UI, and a map that feels authored rather than generated from large CSS rectangles.

The task, project, agent, evidence, connector, and drawer behavior remains unchanged.

## Chosen approach

Keep the semantic React map and deterministic 16 px coordinate system, but replace the coarse CSS block grammar with an original tile-and-sprite layer.

- One small original visual vocabulary supplies grass, path edges, water, forest canopy, cliffs, flowers, signs, and building parts.
- React still positions every task and agent and keeps every building a real button.
- CSS composes original pixel sprites at integer scale. No Canvas, Phaser, map editor, or new runtime dependency is added.
- Pokémon repositories and screenshots remain composition references only. No asset is copied, traced, recolored, or bundled.

This is the simplest route to reference-level map composition without creating a game engine.

## Composition

The world becomes one compact settlement framed by a nearly continuous forest wall. A main irregular sand path loops through the village instead of forming a rigid cross. Secondary paths connect individual homes. A pond or river edge occupies one corner and a raised rocky edge occupies another, creating recognizable landmarks.

Projects remain named districts, but signs sit inside the world instead of acting like floating labels. Features cluster houses into small neighborhoods. Tasks use smaller building footprints, leaving room for trees, mailboxes, flowers, fences, lamps, and agents.

## Building language

Complete buildings use three original house families with multi-tone roofs, eaves, wall trim, doors, windows, steps, and small props. State changes remain immediately readable:

- planned: cleared dirt lot with stakes and rolled plans;
- in progress: foundation or timber frame under construction;
- blocked: unfinished structure plus striped barrier and red marker;
- awaiting review: complete shell plus amber inspection flag;
- verified: complete house plus a restrained green completion marker.

Buildings are visually smaller and more detailed than V4. Their semantic hit areas remain at least 44 px.

## Terrain language

- grass uses several original 16 px motifs rather than one repeated diagonal texture;
- paths use center, straight edge, outer corner, and inner corner tiles to form soft bends;
- forest uses overlapping canopy rows with dark undergrowth, not isolated square trees;
- water uses a shoreline, two blue depths, rocks, and short stepped ripples;
- rocks, fences, flowers, mailboxes, and lamps break repetition without adding interaction targets.

## UI

The map owns the screen. The village plaque shrinks to a compact top-left location window. The agent party becomes a small expandable-looking cluster rather than a large panel. Legend and reset controls sit at the bottom edge and do not cover buildings. Task details keep the existing field-menu drawer.

## Responsive behavior

Desktop shows the settlement as an authored 4:3-like composition with enough crop to invite panning. Mobile begins near the main square, keeps the compact HUD visible, and lets the user drag to explore before reaching the attention journal below.

## Verification

- Preserve all unit and E2E behavior from V4.
- Add checks for the forest border, organic route pieces, terrain landmark, compact building variants, and reduced motion.
- Capture and inspect 1440 × 1000 and 390 × 844 previews.
- Reject the iteration if it still reads as a dashboard, uses rigid cross-shaped roads, exposes sparse isolated trees, or lets HUD panels dominate the map.

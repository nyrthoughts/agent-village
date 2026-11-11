# Agent Village: design pack v4, "detailed RPG village" (awaiting validation)

Status: **design proposal, not validated**. Demo data only. Builds on `../village-v4/` (RPG village) and keeps its layout, chrome, data rules and pipeline.

## 1. What changed

Owner feedback on v4: "work the characters much more: more detail, different characters, races or families, lots of variety, maybe an agent that creates characters with several designs. Buildings, grass, everything much more detailed, very realistic, same genre."

| Area | v4 | This pack |
|---|---|---|
| Characters | Two chibi templates (artisan, scholar) | **Generated villagers**: one per agent, from its id. Five families (human, elf, dwarf, halfling, beastfolk), 8 skin and 6 fur tones, 8 hair styles and 15 hair colours, beards, irises, glasses, scarves, satchels, freckles, earrings, 3 artisan hats and 4 scholar hats (or none), 3 artisan tools and 4 scholar tools. Faces have sclera, iris, pupil, catchlight, brows, nose, mouth. |
| Buildings | Flat walls, roof prisms | Stone footings, brick and stone with recessed mortar, timber frames with diagonal braces, multi-pane windows with lintels, sills, open shutters and flower boxes, plank doors with iron hinges, a ring handle, a stone step and a wall lantern, roofs built from overlapping tile courses with barge boards and a ridge, chimney pots, ivy on stone houses. |
| Ground | Checker toon grass | A meadow with patchy tones, about 31,000 instanced grass tufts and 800 flowers before exclusion (geometry nodes) that keep off paths, yards and houses; pebbles scattered on every path and yard; a cobbled plaza. |
| Trees | 4 spheres | 14 leaf clusters in three greens, root flare; pines in five tiers. |
| Shading | Toon | Stylized PBR (subsurface skin, sheen on cloth, glossy eyes), thinner ink line. |

## 2. The villager generator (`blender/characters.py`)

- `persona(agent_id, source)` returns a character sheet from a seed derived from the id. Same id, same villager, every render and every session.
- `villager(...)` builds the 3D figure from the sheet in any of the six state poses.
- **Meaning stays in three channels only**: guild = source (Artisans = Claude Code CLI, Scholars = Codex), workstation = project, pose + crystal + emote = state. Family, face, hair and accessories are decoration and encode nothing.
- Proposed owner controls: re-roll a villager, or pin one; the choice is saved with the agent id.
- Board `07-villager-generator.png` shows 24 generated villagers and the sheets of the 12 demo agents.

## 3. Boards

`visuals/01` to `06` as in v4 (scene, drawer top and bottom, states, mobile, assets, reduced motion), plus `07-villager-generator.png`.

## 4. Rebuild

```bash
for j in scene zoom parked states props; do .venv/bin/python blender/v5_render.py $j renders/$j; done
.venv/bin/python blender/lineup.py renders/lineup.png n=24 cols=12 scale=4
.venv/bin/python blender/lineup.py renders/lineup-close.png n=8 cols=8 scale=4 ortho=7.5
python3 blender/export.py && node shoot.mjs
```

`v5_render.py` imports `village5.py`, which rewires the v4 layout code (`../village-v4/blender/jrpg.py`) in place. Shared helpers stay in `../village-v3/blender/av.py`.

## 5. Unchanged rules

Demo marking everywhere; no percentages, HP, levels or other invented stats; activity is never a commit, CI run or deploy; the Claude app stays "unavailable" (one closed stall, no villagers, no chats per project); no history API assumed. Genre-level inspiration only: nothing is taken from Dragon Quest or any other game.

## 6. Known limits

- Villagers are 1.3 × real size and stylized; at the 1x overview a face is a few pixels, so detail shows in the zoomed view, the drawer avatars and board 07.
- Render time rose with the detail (about an hour of CPU for all boards). Production would bake per-house layers once and only re-render villager sprites.
- Frame timing is not measured.

## 7. Open decisions

1. Validate the level of detail and the generated villagers, or name what to change.
2. Should families stay purely decorative, or may the owner assign one per project as a theme?
3. Re-roll and pin controls: in scope for step 3?

## 8. Known issues

- A small black render artefact on the ground beside the well (carried over from v4, cause not found).
- On the overview the rendered village has a straight edge where the frame stops; the stage colour continues beyond it.

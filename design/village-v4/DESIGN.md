# Agent Village: design pack v3, "village RPG" (awaiting validation)

Status: **design proposal, not validated**. Every value on the boards is demo data. Earlier packs stay for comparison: `../village-v2/` (first pass, rejected as AI slop) and `../village-v3/` (architectural model, judged "too professional").

## 1. What changed and why

Owner feedback on v3: "less professional, more video game, in the spirit of Dragon Quest."

This pack moves to a **bright Japanese-RPG village**: gabled cottages around a plaza with a well, chibi villagers, toon shading with ink outlines, menu windows with a cream double border and a dot font, emote bubbles over characters. These are conventions of the genre. Nothing is taken from Dragon Quest or any other game: no character, monster, logo, font, map, music or frame art. Characters, houses and props are original and modelled from code.

Everything else holds: the information architecture, the "Needs you" column, the data rules (section 8), the camera and tile size, and the layer pipeline.

## 2. Contents

| Path | Content |
|---|---|
| `visuals/01-desktop-scene.png` | Desktop 1440 × 900: the whole village, "Needs you" open. |
| `visuals/02-desktop-project-drawer.png`, `02b-…` | Warehouse selected: camera zoomed, rest of the village dimmed, project drawer. |
| `visuals/03-states-motion.png` | Six states per source, grayscale check, frames, motion, reduced motion. |
| `visuals/04-mobile.png` | Mobile: one house at a time, Needs you sheet, project context. |
| `visuals/05-asset-sheet.png` | Layer pipeline and every modelled asset. |
| `visuals/06-desktop-reduced-motion.png` | Reduced motion: the walker waits by the forge. |
| `blender/jrpg.py` | Village generator: toon materials, ink outlines, houses, villagers, props. Reuses `../village-v3/blender/av.py` helpers. |
| `blender/rpg_render.py` | Render jobs: `scene`, `zoom`, `parked`, `states`, `props`. |
| `renders/` | WebP layers, frames, assets, JSON with crops and anchors. |
| `prototype/` | HTML composite and chrome. Design tool, not production code. |

## 3. Visual grammar

| Channel | Meaning | Detail |
|---|---|---|
| House | Project | Roof colour + pictogram sign (book, key, gear, sack, flag) + yard props. Atlas: stone library, blue roof, 2 floors. Privacy Desk: stone house, green roof, iron door. Connector Lab: workshop, orange roof, forge and rope coils. Warehouse: plank barn, red roof, crates, sacks, hay. Launch Studio: guild hall, purple roof, notice board and banners. |
| Villager outfit | Source | **Claude Code CLI** = artisan (terracotta tunic, cap, hammer, works at an anvil or desk). **Codex** = scholar (blue robe, pointed hat, staff, works at a lectern). **Claude app** = one closed market stall on the plaza: no source, so no villagers and no chats per project. |
| Pose, crystal, emote bubble | State | Pose alone separates the six states in grayscale. The crystal on each workstation is the status light. Emote bubbles (HTML) mark the three states that need you. |
| Saturated state colours | State only | Roofs and outfits use the village palette; state colours appear only on crystals and in the UI. |

States: working (tool at work), idle (standing, looking around), approval (turned to face you, arm raised), input (head tilted toward the path, hand up), error (sitting, dazed, stars circling), offline (asleep on its back).

## 4. Layout

Same structure as v3 (`../village-v3/DESIGN.md` §4), restyled:
- Every panel is a **window**: ink-blue fill, cream 2 px border, ink gap inside and outside, 7 px radius, a hard drop shadow.
- Selection uses a **▶ cursor** instead of underlines and pills. The primary action is the one filled window button.
- Project names sit on **plates over each roof**. Houses stand in a horseshoe at the back, so plates never cover a villager.
- Requests show as **emote bubbles** ("!" shield for approval, "?" for input, triangle for error) with the agent name above. In the zoomed view the selected request opens as a **dialogue box** with a ▼ prompt.
- The activity log is a message window; the legend and the camera controls are windows.

## 5. Typography

DotGothic16 (Google Fonts, OFL) for all chrome text, 12.5 to 38 px. Geist stays as a fallback. A dot font keeps the game feel; sizes stay at 14 px or more for body text.

## 6. Tokens

| Token | Value |
|---|---|
| `--bg` / `--win` / `--win-2` | `#05060C` / `#10142E` / `#171C3D` |
| `--edge` (window border) | `#EFE8D2` |
| `--line` / `--line-2` | `#2B3260` / `#3D4580` |
| `--text` / `--soft` / `--muted` | `#F5F1E4` / `#C9C4B3` / `#8F8CA3` |
| State colours | unchanged: `#00BA7C`, `#8B98A5`, `#FFAD1F`, `#1D9BF0`, `#F4212E`, `#536471` |

Village palette (toon base colours): grass `#7DB654`/`#75AD4C` tiles, path `#D9B77E`, cobble `#B8B2A6`, water `#3F8EC9`, plaster `#F3E9D2`, stone `#C9C2B4`, timber `#6B4228`, roofs blue `#4C7BD6`, red `#D4553E`, green `#3E9A6B`, purple `#8A62C9`, orange `#E58C3A`, artisan `#D0673F`, scholar `#4F7FD8`.

## 7. Rendering

Blender 5.2 Cycles, Toon BSDF blended with a soft diffuse, one sun and a pale sky. Ink outlines use an inverted hull whose material is visible to camera rays only, so outlines never cast shadows. Flat ground pieces carry no outline. Camera, scale, anchors, shadow-catcher bot layers and WebP export are the same as v3 (`../village-v3/DESIGN.md` §9).

## 8. Data rules

Unchanged from v3 §8: DEMO marking everywhere, no percentages, no HP bars, levels or other game stats (they would be fake metrics), activity is never a commit, CI run or deploy, the Claude app stays unavailable, no history API assumed.

## 9. Open decisions

1. Validate the village direction, or name what to change (palette, outfits, dot font).
2. Toon 3D (this pack) or a pixel-art pass rendered from the same scene.
3. New project: a new house on the next free lot of the horseshoe, or a second village "map" when the horseshoe is full.

## Known issues

- A small black wedge renders on the ground beside the well (overview and zoom). Its cause is not found yet; it is a render artefact, not part of the design.
- Villager sprites are 1.45 × real size for legibility at 1x.

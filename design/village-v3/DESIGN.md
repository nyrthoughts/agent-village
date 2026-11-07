# Agent Village: design pack v2 (step 2, awaiting validation)

Status: **design proposal, not validated**. No code under `src/` was changed. Every value on the boards is demo data. The v1 pack stays in `design/village-v2/` for comparison.

## 1. What is in this pack

| Path | Content |
|---|---|
| `AUDIT.md` | Tool preflight, anti-slop audit of v1, cross-model art direction and the chosen direction. |
| `REVIEW.md` | Independent review and anti-slop pass on these v2 boards, with what was fixed. |
| `visuals/01-desktop-scene.png` | Desktop 1440 × 900: the whole floor, "Needs you" column open. |
| `visuals/02-desktop-project-drawer.png` | Warehouse selected: camera zoomed, other rooms dimmed, project drawer (top). |
| `visuals/02b-desktop-drawer-bottom.png` | Same drawer scrolled: tasks, linked repo, artifacts, unavailable source. |
| `visuals/03-states-motion.png` | Six states per source, grayscale check, sprite frames, HTML layer, motion and reduced motion. |
| `visuals/04-mobile.png` | Mobile 390 × 844: room view, Needs you sheet, project context. |
| `visuals/05-asset-sheet.png` | Layer pipeline and every modelled asset, same scale per row, floor anchors. |
| `visuals/06-desktop-reduced-motion.png` | Reduced motion on: the walker waits at its station. |
| `blender/` | The scene generator (`av.py`), render jobs (`render.py`), monitor screens (`screens.py`). |
| `renders/` | Rendered layers, sprite frames and asset renders (WebP), plus JSON with crops and anchors. |
| `prototype/` | HTML that composites the layers and draws the UI. Design tool, not production code. |
| `asset-manifest.json` | Every asset: file, role, size, anchor, frames. |

Rebuild: see section 10.

## 2. Direction: an architectural model of one office floor, at night

The village is one office floor built like an architect's model and sitting on a dark plinth. Each project is a room. Walls facing the viewer are cut at 0.95 m and capped in black, the convention of a sectioned model, so every room reads at once. The two back walls are full height with windows onto a night sky. The lighting is an evening office: cool overhead light, warm ceiling panels per room, desk lamps, lit monitors.

Why this and not v1's island in space: see `AUDIT.md`. In short, two independent model passes rejected the same things in v1 (stock cute robots, floating starfield platform, flat single-hue materials, neon floor rings) and converged on the same three moves: no faces, physical materials under one light rig, a grounded set.

Kept from v1: the information architecture, the "Needs you" column, the redundant state signals, provenance tags and every data rule.

## 3. Visual grammar

One meaning per channel.

| Channel | Meaning | Detail |
|---|---|---|
| Room | Project | Same floor, same wall height, same light rig. Each room has signature props that say what the project does. |
| Machine silhouette and body colour | Source tool | Cart on casters with one arm and a sensor head = **Claude Code CLI** (terracotta). Weighted column with a telescoping mast and a scanner bar = **Codex** (porcelain blue). Covered dock = **Claude app** (ivory, always covered). |
| Pose, desk monitor, status light, HTML call-out | State | Four redundant signals. Pose and monitor alone separate all six states in grayscale (board 03). |
| Saturated colour | State only | Decor uses material swatches: concrete, plaster, oak, birch ply, walnut, galvanised steel, felt. Project tints are muted and appear only on felt, binders and bins. |

Bots have no faces, no eyes and no expressions. They are machines with a posture.

Room signatures (demo projects):

| Room | Project | Signature props |
|---|---|---|
| Back left | Atlas, knowledge graph | Archive shelving, pinboard with cards and thread, walnut reading table |
| Back middle | Privacy Desk, compliance | Locker bank, safe, filing cabinets, shredder |
| Back right | Connector Lab, integrations | Workbench with pegboard and tools, parts bins, cable spools |
| Front left | Warehouse, data models | Server racks, pallet racking with cartons |
| Front right | Launch Studio, go-to-market | Whiteboards on wheels, lounge corner with sofa |

## 4. Layout

### Desktop (≥ 1200 px)

```
┌──────┬────────────────────────────────────────────────┬──────────────────┐
│ rail │ header 56: Village · DEMO · counts · Village|List │                  │
│ 64px │ tabs · source status · synced time              │                  │
│      ├────────────────────────────────────────────────┤ column           │
│      │ stage: scene layers + HTML annotations          │ 400 (Needs you)  │
│      │ HUD: DEMO DATA (top right), activity log and    │ 440 (Project)    │
│      │ legend (bottom left), zoom/recentre/motion      │                  │
│      │ (bottom right)                                  │                  │
└──────┴────────────────────────────────────────────────┴──────────────────┘
```

Stage layers, bottom to top:
1. Stage background `#050506` with a soft edge vignette. No stars, no glow.
2. Room base layer (one static render).
3. Bot layers, painter-sorted by `x + y` of the bot's floor point.
4. HTML: project annotations, call-outs, name chips.
5. HUD.

Rules:
- **Project annotations**, not plates: the room name sits on a thin leader line that starts at the room's back corner, like a note on a model. Overview shows name plus pending-request counts (glyph + number). Selected view adds agents, working count and last activity.
- **Call-outs**: overview shows the compact call-out only (glyph + agent name) with a short stem down to the bot. The detailed call-out (kind, request text, agent, source, age) appears on hover, keyboard focus, or in the zoomed project view.
- Name chips for working, idle and offline bots appear on hover or focus only (shown in the zoomed view on board 02).
- Clicking a room or its annotation zooms the camera to it, dims the rest of the floor to 38 %, and switches the column to "Project".
- Clicking a bot, call-out or card opens the source (session, transcript or task) in its own tool. Agent Village never answers for the user.

Label system (anti-slop rule): one pill only, the primary action button. Tabs and filters are underlined text. Counts are glyph + number. Plates, legend and log are hairline boxes with 4 px radius.

### Mobile (< 768 px)

At 390 px the whole floor would make each bot about 20 px tall, so mobile frames one room at a time, from the same render.
- Top bar 50 px: logo, title, DEMO, "Needs you · n" button.
- Project strip (underlined tabs with counts). Swipe on the scene changes room.
- Bottom sheet: peek with the most urgent request across all projects; full height for "Needs you" or project context.

### Context column

"Needs you": title, one-sentence summary, filters (All / Errors / Approvals / Questions), groups in that order (a stopped agent comes first), rows sorted by age inside each group. Row: state bar, glyph, agent, project, age, request text, source, one action ("Open session", "Open transcript", "Open task").

"Project": back link, name, four-cell stats strip, last activity, then goal, agents and chats, Claude app (unavailable), decisions, tasks, linked repo, artifacts, "Open full context". The linked repo is a link only and shows no CI status.

Every block shows its provenance: "entered by you", "read locally · CLI, Codex", "detected · local folder", "links added by you". A block with no source shows a hatched empty state with the reason.

## 5. Typography

| Role | Font | Size / weight |
|---|---|---|
| Screen title | Geist | 19 / 700 |
| Column title | Geist | 21 / 700 (drawer 26) |
| Body, request text | Geist | 15–15.5 / 400 |
| Secondary | Geist | 13–14 / 400, `--soft` or `--muted` |
| Agent names, timestamps, provenance, counts | Geist Mono | 11–13.5 / 500–600 |
| Section kickers | Geist Mono | 11 / 600, uppercase, 0.06 em |

Mono is limited to identifiers and machine values. Prose and buttons use Geist. Both fonts are OFL (Google Fonts).

## 6. Colour and material tokens

Chrome:

| Token | Value |
|---|---|
| `--bg` | `#000000` |
| `--surface` / `--surface-2` / `--surface-3` | `#0C0D0F` / `#141518` / `#1D1F23` |
| `--line` / `--line-2` | `#2A2D31` / `#3A3E43` |
| `--text` / `--soft` / `--muted` | `#E7E9EA` / `#AAB1B8` / `#71767B` |
| `--stage` | `#050506` |

States (reserved, never decoration):

| State | Colour | Glyph | Pose | Monitor |
|---|---|---|---|---|
| working | `#00BA7C` | none | head down over the desk, arm forward | scrolling text |
| idle | `#8B98A5` | none | arm parked upright, body turned off the desk | dimmed |
| approval | `#FFAD1F` | shield + check | arm raised, head turned to face the viewer | two-button dialog |
| input | `#1D9BF0` | question mark in a circle | head turned to the aisle, tilted | open text field |
| error | `#F4212E` | triangle | arm dropped, head slumped, warning triangle on the floor | red banner |
| offline | `#536471` | none | dust cover on | off |

Materials (sRGB base colour, roughness): concrete `#8E8A82` 0.62, plaster `#B3ADA2` 0.92, section cap `#17171A`, oak `#9C6E45`–`#C4945F` 0.5, birch ply `#C9A87C`–`#E2C9A2`, walnut `#4A3020`–`#6E4A31`, black steel `#1B1C1F` metal 0.7, galvanised `#9AA0A6` metal 1.0, felt `#34373B`. Bot bodies: CLI `#A85E44`, Codex `#97A8BC`, Claude app `#D3CBBA`.

Project tints (muted, felt and binders only): Atlas `#8A84A6`, Privacy Desk `#7A978A`, Connector Lab `#748AA6`, Warehouse `#A6926C`, Launch Studio `#A68294`.

## 7. Animation contract

Sprite frame swaps (`steps()` on a sprite sheet) plus CSS `opacity` for call-outs. No layout animation, no video, no per-state video. Target 60 fps, not measured yet. Bot sprites anchor at the floor point.

| State | Normal | Reduced motion |
|---|---|---|
| working | f0 to f3 loop, 180 ms per frame (4° nod). Status light steady. | f0 only. |
| idle | f0 to f3 loop at 900 ms (look-around). May walk an aisle at 0.8 m/s. | f0 only. No walking: the bot waits at its station. |
| approval | f0 to f2 over 540 ms, hold f2; every 4 s a small lift (f3, f2). Call-out fades in over 200 ms. | f2 held. No fade. |
| input | f0 to f3 ping-pong, 650 ms per frame (head tilt). | f2 held. No fade. |
| error | On entry f1, f2, f1, f2 at 120 ms (shake), then f0, still. Repeats every 6 s. No flashing. | f0 only. No shake. |
| offline | None. | Same. |

Reduced motion triggers: `prefers-reduced-motion: reduce`, or the Motion control on the stage. Also pause walkers off-screen and in hidden tabs, as `main` already does for its animals.

## 8. Data rules

Unchanged from v1. They are the reason the design is honest.

- Every screen built from fixtures shows "DEMO" in the header and "DEMO DATA" on the stage.
- No percentages, progress bars or completion estimates.
- Activity is never a commit, a CI run or a deployment. The repo block says so in the UI.
- No history API is assumed. Source status shows **supported** or **unavailable**. On `main`, native mode reads the local Codex index and Claude Code journals. Nothing reads the Claude app, so the demo labels it **unavailable** and its dock stays covered (offline). Verify the live status before showing a real label.
- **Unverified and blocking for real data:** the three "needs you" states each need a signal per source (for example Claude Code permission or notification hooks, Codex approval records). None is verified. Without a signal, the UI must not invent the state.
- `main` treats "working" as a signal less than two minutes old. Keep that threshold. Older activity is idle.
- Goal, decisions, tasks and artifacts are owner-entered. Extracting them from transcripts is out of scope until a source is verified.
- Names are fictional (`demo-org/warehouse`, agent ids, projects). All statuses are invented.

## 9. Assets and how they are made

**Option B from v1 is now real.** Blender 5.2 (as the `bpy` Python module) builds the whole floor from code and renders it with Cycles. Nothing is downloaded: no model, texture, HDRI or font is baked in. No image-generation model was used, and no paid call was made.

- Camera: orthographic, rotation X 60°, Z 135°. That is 30° elevation, which gives an exact 2:1 tile. 1 m = 1 tile = 64 × 32 px at 1x; 45.25 px per metre across the screen; 39.19 px per vertical metre. (v1 said "26.57° elevation" and "38 px": both corrected.)
- Projection for code: `screen = ((y − x) · 32, (x + y) · 16 − z · 39.19)` at 1x, world origin at the floor's back corner, +y running screen right-down, +x running screen left-down.
- Base layer: one render of the floor with every monitor off and no bots.
- Bot layers: each bot rendered alone while the rest of the scene is a **shadow catcher**. The sprite keeps its contact shadow and is correctly hidden by anything in front of it, so plain z-order compositing in the browser is exact. The bot's lit monitor travels in its layer, so the monitor changes with state.
- Sprite frames: one fixed camera target, so every frame of every state shares the same anchor.
- Export: WebP with alpha, @2x (zoomed view @3x), sRGB, no baked text (monitors show abstract bars only), no secrets, no transcript content. Call-outs, annotations and rings of v1 are gone from the art; the HTML layer carries every word.
- Bots are 1.2 × real size (1.6 m) for legibility at 1x. Everything else is at real scale.

What step 3 still needs: split the base layer per room (so a room can be dimmed or rebuilt alone), pack frames into sprite sheets, measure frame time, and decide how a new project gets a room (see open decisions).

## 10. Rebuild

```bash
python3 -m venv .venv && .venv/bin/pip install bpy==5.2.3 pillow numpy
python3 blender/screens.py renders/screens
for j in scene zoom parked states props; do .venv/bin/python blender/render.py $j renders/$j; done
node shoot.mjs
```

About 25 minutes of CPU on 4 cores. `bpy` is about 400 MB and stays outside the repo.

## 11. Handoff to Claude Code (after validation only)

1. Read `CONTRIBUTING.md`, `docs/architecture.md` and `docs/connections.md` on `main`.
2. Work on a branch. Do not merge to `main`. Do not build on PR #2's visuals.
3. Render per-room base layers and sprite sheets from `blender/` (same camera, same scale).
4. Replace the scene layer in `src/client/scene` / `src/client/scene2d` with image layers placed by the projection above and painter-sorted by `x + y`.
5. Map existing state to the six states. Keep `main`'s provenance rules and the two-minute working threshold.
6. Port the HTML layer, tokens and the "Needs you" column as specified here.
7. Extend `e2e/reduced-motion.spec.ts`, `e2e/mobile.spec.ts` and `e2e/desktop.spec.ts` to cover each state.

## 12. Open decisions for the owner

1. Validate the direction (office-floor model, faceless machines), or name what to change.
2. Bot scale: 1.2 × real (current) or real size with larger call-outs.
3. New projects: add a room to the floor plan (the floor grows), or keep a fixed number of rooms and page between floors.
4. `main`'s construction metaphor (goals grow a house): drop it, or show it as a room being fitted out.
5. Desktop column default: "Needs you" (proposed) or the last selected project.

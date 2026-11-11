# Agent Village: design pack (step 2, awaiting validation)

Status: **design proposal, not validated**. No repository was changed. No final code exists. Every value in the visuals is demo data.

## 1. What this pack contains

| Path | Content |
|---|---|
| `prototype/contact.html` | Step 1 contact sheet source. The rendered board and the third-party images are not published here (copyright); links are in `references/ATTRIBUTION.md`. |
| `visuals/01-desktop-scene.png` | Desktop scene, 1440 × 900, "À toi" column open. |
| `visuals/02-desktop-project-drawer.png` | Desktop, project selected (`Warehouse`), camera zoomed, context drawer (top). |
| `visuals/02b-desktop-drawer-bottom.png` | Same drawer scrolled: tasks, linked repo, artefacts, unavailable-source state. |
| `visuals/03-states-motion.png` | Six agent states, sprite frames, UI layer, animation contract, reduced motion, tokens. |
| `visuals/04-mobile.png` | Mobile 390 × 844: scene, "À toi" sheet, project context. |
| `visuals/05-asset-sheet.png` | Draft assets, one layer per file, constant scale per row, anchors. |
| `visuals/06-desktop-reduced-motion.png` | Desktop with reduced motion on: no walker, every bot at its station, control active. |
| `prototype/` | Clickable design prototype that produced the visuals. Not production code. |
| `asset-manifest.json` | Asset list: file, role, size, anchor, frames. |
| `references/ATTRIBUTION.md` | Links to third-party inspirations. Images not redistributed. |

Open the prototype: `prototype/app.html`. Useful URL parameters: `mode=atoi|project`, `focus=warehouse`, `device=mobile&screen=scene|atoi|project`, `motion=reduced`, `shot=1` (freezes animation for screenshots). Re-render all PNGs with `./shoot.sh` (headless Chrome).

**How the images were made.** No image-generation model was used. A Figma `generate_image` tool is connected, but it spends Figma AI credits; I did not use it without your go. Every prop and bot is drawn as procedural isometric SVG (`prototype/iso.js`), then rasterised by headless Chrome. Section 9 gives the options for final assets.

## 2. Direction

A warm isometric office, as an archipelago in the dark. Each project is an open pavilion on one floating platform. Interiors are lamp-lit and warm. The chrome around the scene is near-black and quiet, close to X.

- Primary reference: maestrooth (cutaway room, bots at desks, "Needs you" bubble, floor ring).
- Spatiality: choopy (floating platform, edge lights) and Mirage (one module per job, alert attached to the module).
- Information: byalexai ("waiting on me" first, a one-sentence summary on top).
- Mood only: Carnage. The author says the video is a promotional render.
- Rejected: the previous generated mockup (pixel-art houses, activity equated to commit/CI/deploy).

## 3. Visual grammar

One rule per channel. Never mix them.

| Channel | Meaning | Detail |
|---|---|---|
| Building | Project | Same template for all: 6 × 5 tiles, walls 2.2 tiles high, desks, lamp, plant. One signature prop set per project. |
| Bot silhouette and body colour | Source tool | Rounded cube with `>_` visor = Claude Code CLI (`#D98B6A`). Capsule with antenna = Codex (`#AFC0DE`). Sphere = App Claude (`#E6DCC6`). |
| Ring, visor expression, bubble, motion | State | Redundant signals. Without colour and motion, ring shape and visor still differ for every state. |
| Saturated colour | State only | Projects use muted tints only (rug, wall trim). |

Bots are original characters, not gumdrops or blobs. Asymmetry keeps them away from the generic cute-robot trope: the Codex antenna is bent to one side, the sphere has a band, the cube has a `>_` face. Push further in step 3 if they still read generic.

App Claude has no known source, so its sphere only appears **offline**. Its other state frames are not budgeted until a source exists.

## 4. Layout

### Desktop (≥ 1200 px)

```
┌──────┬──────────────────────────────────────────┬────────────────────┐
│ rail │ header 56 px: title · DÉMO · counts ·     │                    │
│ 72px │ Village/Liste · source chips · sync time  │                    │
│      ├──────────────────────────────────────────┤ context column     │
│      │ stage (scene + overlays)                  │ 380 px (À toi)     │
│      │ HUD: demo watermark (top right),          │ 440 px (Projet)    │
│      │ recent activity + legend (bottom left),   │ tabs: À toi | Projet│
│      │ zoom/recenter/motion (bottom right)       │                    │
└──────┴──────────────────────────────────────────┴────────────────────┘
```

Stage layers, bottom to top:
1. Background: `#05060A` with a radial glow and sparse stars.
2. Scene: platform, paths, pavilions, props, bots. Raster sprites in the final build, painter-sorted by `x + y`.
3. Overlays (HTML, positioned from scene anchors): project plates, bubbles, name chips.
4. HUD.

Rules:
- Project plate sits above the pavilion's back corner. Overview shows name + pending-request pips only. Details appear on hover or selection.
- Overview shows **compact** bubbles only (icon + agent name). The detailed bubble appears on hover, keyboard focus, or in the zoomed project view. It opens to the right of the bot.
- Name chips for working/idle/offline bots appear on hover or focus only.
- Clicking a pavilion or plate zooms the camera to it, dims the others to 28 % opacity, and switches the column to "Projet".
- Clicking a bot, bubble or card opens the source (transcript, task, or context) in its own tool. Agent Village never answers for the user. This matches `docs/connections.md` on `main`: the app observes, it never approves or instructs.

### Mobile (< 768 px)

At 390 px the full village makes bots about 12 px tall. Mobile frames one pavilion at a time.
- Top bar 52 px: logo, title, DÉMO, "À toi · n" button.
- Project strip (horizontal scroll, pips per project). Swipe on the scene changes project.
- Bottom sheet: peek 214 px with the most urgent request; full height for "À toi" or project context.

### Context column content

"À toi": one-sentence summary, filters (Tout / Erreurs / Approbations / Questions), groups in that order (a stopped agent comes first), cards sorted by age. Card: type icon tile, agent, project, age, request text, source chip, one action ("Ouvrir la session", "Ouvrir le transcript", "Ouvrir la tâche").

"Projet": back link, name, counts by state, last activity, then objective, agents and chats, App Claude (unavailable state), decisions, tasks, linked repo, artefacts, "Ouvrir le contexte complet". The linked repo is a link only. It shows no CI status.

Every block shows its provenance tag: "saisi par toi" (owner-entered, like the goal ledger on `main`), "lus en local" (agents read from local Codex and Claude Code data), "détecté · dossier local" (repo). A block with no source shows a hatched empty state with the reason.

## 5. Typography

| Role | Font | Size / weight |
|---|---|---|
| Screen title | Geist | 20 / 800 |
| Section title | Geist | 20 / 800 (drawer 22) |
| Body, card text | Geist | 15 / 400 |
| Secondary | Geist | 13–14 / 400, `--muted` |
| Labels, agent names, timestamps, chips | Geist Mono | 11–13.5 / 500–600 |
| Eyebrows (section kickers) | Geist Mono | 11 / 600, uppercase, 0.08–0.1 em tracking |

Both fonts are OFL (Google Fonts). Fallbacks: Inter, system-ui; JetBrains Mono, ui-monospace.

## 6. Colour tokens

Chrome:

| Token | Value |
|---|---|
| `--bg` | `#000000` |
| `--surface` / `--surface-2` / `--surface-3` | `#0E0F12` / `#16181C` / `#202327` |
| `--border` / `--border-2` | `#2F3336` / `#3E4144` |
| `--text` / `--soft` / `--muted` | `#E7E9EA` / `#A3ABB3` / `#71767B` |
| `--scene` | `#05060A` |

States (reserved, never used for decoration):

| State | Colour | Icon | Ring | Bubble background / ink |
|---|---|---|---|---|
| working | `#00BA7C` | none | dashed, rotating | none |
| idle | `#8B98A5` | none | none | none |
| approval | `#FFAD1F` | shield + check | solid with 4 notches + halo | `#FFE7B3` / `#3D2800` |
| input | `#1D9BF0` | question mark | open (gap at front) + halo | `#CDE7FF` / `#062B4D` |
| error | `#F4212E` | warning triangle | double | `#FFD3D6` / `#4D0A10` |
| offline | `#536471` | none | dotted | none |

Materials: floor `#8E5D3F`, wall `#4A5070`, wall top `#6A7194`, desk top `#D9C8A8`, metal `#2B2F3A`, platform `#1A1D27`, path `#2E3343`.
Project tints (muted): Atlas `#9D8FD6`, Privacy Desk `#7FB59E`, Connector Lab `#7E9CC9`, Warehouse `#C9A86A`, Launch Studio `#C88AA8`.

## 7. Animation contract

CSS `transform` and `opacity` only. Target 60 fps; not measured yet. Origin of bot transforms: bottom centre. No generated video. No per-state video.

| State | Normal motion | Reduced motion |
|---|---|---|
| working | 700 ms alternate bob of 2 px, ease-in-out. Visor caret blinks at 1 s. Ring dash offset runs 1.2 s linear. | Frame f0. Dashed ring stays, static. Caret solid. |
| idle | 3.2 s breathe (scale Y +3.5 %). Blink every 4–7 s, random. May walk paths at 0.8 tile/s. | Frame f0. No walking: bot stays at its station. |
| approval | 2 s loop: 7 px hop then 2 px rebound. Amber halo expands over 1.8 s. Bubble pops in 350 ms. Visor: wide round eyes. | Frame f0. Notched ring and round eyes carry the state. Bubble appears with no pop. |
| input | 2.6 s tilt, −5° then +4°. Blue halo. Visor: one eye and a "?". | Frame f0. Open ring and "?" visor carry the state. |
| error | 480 ms shake on entry, then every 6 s. Otherwise still. X eyes, double red ring. No continuous flashing. | No shake. X eyes and double ring. |
| offline | None. Body desaturated, eyes off, dotted ring, monitor off. | Same. |

Reduced motion triggers: `prefers-reduced-motion: reduce`, or the "Animations réduites" control. Also pause walkers off-screen and in hidden tabs (as `main` already does for its animals).

## 8. Data rules

- Every screen built from fixtures shows "DÉMO" in the header and a "DONNÉES DE DÉMO" watermark on the stage.
- No percentages, progress bars or completion estimates.
- Activity is never a commit, a CI run or a deployment. The repo block says so in the UI.
- No history API is assumed. Source chips show **supporté** or **indisponible**. On `main`, native mode reads the local Codex index and Claude Code journals. Nothing reads the App Claude, so the demo labels App Claude **indisponible** and its bots **hors ligne**. Verify the live status before showing a real label.
- **Unverified and blocking for real data:** the three "needs you" cases need a signal per source. Which signals exist (for example Claude Code permission or notification hooks, Codex approval records) is not verified. Without a signal, the UI must not invent the state.
- `main` treats "working" as a signal less than two minutes old. Keep that threshold. Older activity is idle.
- Objective, decisions, tasks and artefacts are owner-entered in this design. Extracting them from transcripts is out of scope until a source is verified.
- Demo repo name is fictional (`demo-org/warehouse`). Project, agent and repo names are fictional; all statuses are invented.

## 9. Assets for step 3

Three options. I recommend **B** for the final look, and **A** only as the layout and timing source while B is produced.

| Option | How | Pros | Cons | Cost |
|---|---|---|---|---|
| A. Procedural vector, exported | Keep `iso.js` as the asset source. A script renders each asset to transparent WebP @2x with a fixed camera. | Same camera and scale by construction. Frames align. No magenta halo. | Flat look. Close to what you called "not at the level". Drawn by code, not by a drawing tool. | Free |
| B. Blender low-poly | Model the props, render with one orthographic isometric camera, same 2:1 angle and tile size as the manifest. Script the renders so every frame uses the same camera. | Real lighting, soft shadows, closest to the maestrooth reference. Deterministic frames. | Blender is not installed here (free install, about 1 GB). Modelling takes longer. | Free, more time |
| C. Image generation | Generate each asset from the prompts below (Figma `generate_image` is connected). | Fast detail. | Camera, scale and frame consistency are hard, so sprites need cleanup. Halo removal needed. | Figma AI credits. Exact cost not checked. Your go is needed first. |

Production format: WebP with alpha, @2x, sRGB, no baked text, no secrets, no transcript content. Ring, bubbles and plates stay SVG/HTML.

Shared prompt prefix for option C:

> Isometric 2:1 game asset, orthographic camera, 26.57° elevation, single object centred, transparent background, soft low-poly flat shading, warm interior night lighting from upper left, no outline, no text, no logo, no characters from existing media, consistent scale where 1 floor tile = 64 × 32 px.

Per-asset suffixes:

| File | Suffix |
|---|---|
| `pavilion-floor` | open-plan oak plank floor slab, 6 × 5 tiles, thin dark plinth |
| `pavilion-wall-back`, `pavilion-wall-left` | plain slate-lavender wall section, 2.2 tiles high, light top cap |
| `desk` | pale oak desk on dark metal legs, one monitor seen from the back, small mug |
| `lamp`, `plant`, `tree`, `lamp-post` | floor lamp with cream shade / ceramic pot with faceted cube foliage / faceted low-poly tree / slim street lamp with warm bulb |
| `prop-shelf` | tall walnut bookshelf full of coloured book spines |
| `prop-bench`, `prop-spool` | wooden workbench with a vice / cable spool |
| `prop-vat` | small steel vat with a coloured lid |
| `prop-lockers` | row of three grey-blue steel lockers |
| `prop-rack` | dark server rack with rows of small green and blue LEDs |
| `prop-whiteboard`, `prop-couch` | whiteboard on an easel with sticky notes / mauve two-seat couch |
| `bot-cli` sprite sheet | small hovering robot, rounded terracotta cube body, dark visor with a glowing `>_` face, 4 frames per state, same pose framing every frame |
| `bot-codex` sprite sheet | small hovering robot, porcelain-blue capsule body with an antenna, dark visor with two glowing eyes |
| `bot-app` sprite sheet | small hovering robot, ivory sphere body, wide dark visor with two glowing eyes |

## 10. Handoff to Claude Code (after validation only)

1. Read `CONTRIBUTING.md`, `docs/architecture.md` and `docs/connections.md` in `nyrthoughts/agent-village`. There is no `AGENTS.md` on `main`.
2. Work on a branch. Do not merge to `main`. Do not build on PR #2's visuals.
3. Produce the assets from `asset-manifest.json` with the chosen option.
4. Replace the scene layer in `src/client/scene` / `src/client/scene2d` (the paths on `main`; PR #2 uses `src/client/village/`) with sprite layers placed by the isometric formula `screen = ((x − y) · 32, (x + y) · 16 − z · 38)`.
5. Map existing state to this design's six states. Keep `main`'s provenance rules.
6. Keep the HTML overlays, tokens and the "À toi" column as specified here.
7. Extend `e2e/reduced-motion.spec.ts`, `e2e/mobile.spec.ts` and `e2e/desktop.spec.ts` to cover each state.

## 11. Open decisions for the owner

1. Validate the direction, or name what to change.
2. Asset option: B (recommended), A or C.
3. `main` has a construction metaphor (goals and milestones grow a house). This design uses fixed pavilions. Keep construction as a pavilion stage, or drop it?
4. Desktop column default: "À toi" (proposed) or the last selected project.

## 12. Sources and attribution

Third-party inspirations only. No logo, character or set is reused. Details in `references/ATTRIBUTION.md`.

| File | Author | Post |
|---|---|---|
| `01-maestrooth-office.jpg` | @maestrooth | https://x.com/maestrooth/status/2115449438571315234 |
| `02-choopyplug1-space-office.jpg` | @choopyplug1 | https://x.com/choopyplug1/status/2116308816677470700 |
| `03-dontstopmirage-station.jpg` | @dontstopmirage | https://x.com/dontstopmirage/status/2117373505738072242 (figures not verified, not reused) |
| `04-byalexai-activity-dashboard.jpg` | @byalexai | https://x.com/byalexai/status/2114837470680318365 |
| `05-0xcarnagee-moon-base-render.jpg` | @0xCarnagee | https://x.com/0xCarnagee/status/2118142092606046248 (promotional render, mood only) |
| `previous-generated-mockup-not-X.jpg` | internal | generated exploration, not a direction |

Not opened in this pass: the X posts themselves (images from `references/` were used), AlexFinn, daddycross, BrianRoemmele and Mission Control links.

# Preflight, anti-slop audit and art direction

Status: working notes for the v2 visuals. Demo data only.

## 1. Preflight (read-only check, 2026-11-07)

| Tool | Present | Notes |
|---|---|---|
| Anti-slop skill | Yes | `anti-slop-audit`. It audits reasoning, not images, so section 2 adds a visual checklist. |
| Codex CLI | No | Installable from npm, but no OpenAI credential exists here. Not used. |
| Image-generation API key (OpenAI, others) | No | No key in the environment. |
| Figma `generate_image` / model runs | Connected | Spends Figma AI credits. Not used: no owner go, cost not stated. |
| Blender | Not as an app | `bpy` 5.2.3 LTS (Blender as a Python module, free, PyPI) installed in a scratch venv, outside the repo. Cycles CPU and OpenImageDenoise work headless. |
| Headless Chrome / Playwright | Yes | Google Chrome and Playwright Chromium. |
| Other | ImageMagick, ffmpeg, Pillow | Used for WebP export and grayscale checks. |

Second model available for art direction: a different Anthropic model, run as a separate subagent with no access to my conclusions. It is not a different vendor. No non-Anthropic model was reachable without a credential. Model names are given in the session report, not in the repo.

## 2. Anti-slop audit of v1 (`design/village-v2/visuals`, `DESIGN.md`)

Written before reading the second model's critique.

### Art

| # | Slop pattern | Where |
|---|---|---|
| A1 | Stock "cute robot": rounded head, dark visor, two glowing eyes, antenna with a ball. Expressions are emoji (X eyes, "?" eye). | All boards, `05` bottom row |
| A2 | Isometric island floating in a starfield with a radial glow. The default generated-iso composition. | `01`, `06` |
| A3 | No light transport: no cast or contact shadows, no ambient occlusion, lamps emit nothing, glows are pasted radial gradients. | `01`, `05` lamp |
| A4 | One flat hue per object, one darker side face. No bevels, grain, seams, wear or roughness contrast. Everything reads as one plastic. | `05` all rows |
| A5 | Same pavilion stamped five times: same footprint, walls, desks, cream tops. | `01` |
| A6 | Filler props: rainbow bookshelf, cylinder "vats", voxel-cube trees, traffic cones and a crate on an empty lot. | `01`, `05` row 3 |
| A7 | Neon floor rings and pastel rug ellipses under bots: HUD stickers on the floor. | `01`, `03` row 3 |
| A8 | Scale drift: bot heads as large as desks, trees as tall as rooms. | `01`, `02` |

### UI and copy

| # | Slop pattern | Where |
|---|---|---|
| U1 | Pill overload: plates, bubbles, chips, filters, legend and buttons share one rounded-pill shape, so nothing has rank. | All desktop boards |
| U2 | Sticker clutter over the art: 5 plates, 5 bubbles and name chips in the overview hide the scene. | `01` |
| U3 | Pastel bubbles with icon-in-circle glyphs, and icon tiles on every card. Default SaaS kit. | `01`, `03` |
| U4 | Mono font and uppercase tracked eyebrows on almost every label. Template tell. | All |
| U5 | Board headlines built on "X, not Y" ("La scène est un empilement d'assets, pas une image"). AI copy tell. | `03`, `05` |
| U6 | Mobile is the desktop scene cropped, not a design for 390 px. | `04` |

### Spec (`DESIGN.md`)

| # | Issue |
|---|---|
| D1 | "26.57° elevation" is wrong. 26.57° is the screen angle of a 2:1 line. A 2:1 orthographic camera sits at 30° elevation (rotation X = 60°). |
| D2 | `z = 38 px` per unit is approximate. Exact value for a 64 × 32 tile is 45.25 × cos 30° = 39.19 px. |
| D3 | "Bots are original characters, not gumdrops or blobs" is contradicted by the boards. Unfalsifiable claim. |

Kept from v1 because it holds: information architecture, the needs-you column and its grouping, redundant state signals, provenance tags, every data rule in §8, the dark chrome tokens.

### Verdict (skill format)

- Slop detected: A1 to A8, U1 to U6, D1 to D3.
- Critical untested assumption: "a state ring under each bot makes state readable without colour". It is readable only because the rings are big neon stickers, which is itself slop (A7).
- Steelman of v1: flat procedural vector is cheap, consistent and fast to animate. True, but the owner already rejected that look, so cost is not the binding constraint.
- What would prove v2 wrong: if a grayscale, motion-free render cannot tell the six states apart. Board 03 tests that directly.
- **Verdict: REWORK.** Keep the information design, replace the art pipeline and the label system.

## 3. Cross-model art direction

Second model, independent critique, summary. Its ranked findings match A1, A2, A4, A5, A7, A6, U3, A3 above, plus two I missed: the chrome shares the scene's radii so UI and art melt into one poster, and the warm-brown plus slate-lavender palette is the default "cosy isometric" combination.

| Direction | Produced by | Reference world | Bots | Main risk |
|---|---|---|---|---|
| **Workshop Ledger** | Second model | Night workshop floor, architectural site models (plywood, MDF, galvanised steel) | Machines with a tool, no face. State by pose and prop. | Reads as logistics software if props get literal. |
| Rooftop Observatory | Second model | Polar station modules, rooftop telescopes, container labs | Rover, walker, docking cradle | Complexity, fog breaks sprite compositing. |
| **Studio maquette** | Primary session model | Architectural model of one office floor on a dark plinth, lit like a night interior | Small devices at desks, back to the viewer, state on the desk monitor and in the pose | Faceless bots can feel cold. |

**Chosen: Workshop Ledger merged with Studio maquette.** Evidence: two independent passes reached the same three moves (no faces, physical materials with one light rig, no floating island) without seeing each other's notes. Rooftop Observatory is dropped: more geometry, more sorting risk, no gain in state readability.

Where I did not follow the second model:
- "Max two saturated colours". There are four state colours. Rule kept in spirit: saturated colour appears only on state elements (status lamp, monitor, HTML layer), never on decor.
- "No pills anywhere". The owner asked for X-like chrome, and X uses pill buttons. v2 keeps one pill: the primary action button. Plates, bubbles, filters and the legend lose the pill.

Rules applied to every v2 asset:
1. Real proportions in metres. 1 tile = 1 m. A desk is 1.6 × 0.8 × 0.75 m, a bot 1.3 m tall.
2. One light rig for everything: cool overhead key, warm practical lamps, monitor light. Path-traced shadows and occlusion, no bloom, no pasted halos.
3. No faces. State reads from pose, the desk monitor and the HTML layer, and survives grayscale.
4. Saturated colour is reserved for state. Decor uses material swatches.
5. Bevels, grain and wear on every material; no object is a raw primitive.
6. No prop without a job: each signature prop says what the project does.

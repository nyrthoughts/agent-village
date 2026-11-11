# Next session prompt (paste into the cloud session)

You continue the Agent Village redesign on branch `design/village-v2` of `nyrthoughts/agent-village`. Work in English only: UI copy, boards, docs, commits.

## Where things stand

- `design/village-v2/` holds a step-2 design pack: `DESIGN.md` (spec), `BRIEF.md` (original brief, French), `visuals/` (7 boards), `prototype/` (clickable HTML prototype, not production code), `asset-manifest.json`.
- The owner accepted the concept: isometric pavilions, one per project, on a floating platform; three bot silhouettes, one per source; six states; "À toi" column with approval, input and error kept distinct; X-like dark chrome.
- The owner rejected the execution. Feedback: too much AI slop. The next version must be more realistic, more modern, more detailed and more complex.
- All boards are in French and use procedural SVG art drawn by code. Both must change.
- Project, agent and repo names are fictional on purpose. The repo is public: never commit real names, company identifiers, absolute home paths, transcripts or third-party images (see `CONTRIBUTING.md`).

## Goal of this session

Produce a v2 design pack, in English, whose art and UI no longer read as AI-generated. Stop after the visuals for owner validation. Do not implement in `src/`. Do not merge into `main`.

## Steps

1. **Preflight, read-only.** List which of these exist in this environment, and report them in one table: the anti-slop skill (`anti-slop-audit` or similar), Codex CLI, any image-generation API key (OpenAI `gpt-image`, others), Blender, headless Chrome or Playwright. Do not install paid tools. Do not assume a tool exists.
2. **Anti-slop audit of v1.** Run the anti-slop skill (or, if absent, a written checklist) on `visuals/` and `DESIGN.md`. Name each slop pattern you find: generic cute robots, flat gradients, emoji-like icons, symmetric layouts, filler copy, and so on.
3. **Cross-model art direction.** If Codex or another model is available, ask it for an independent art-direction critique and two alternative directions. Compare them with yours. Keep the one with the strongest evidence. Say which model produced what.
4. **Assets.** Recommended path: Blender low-poly with one scripted orthographic isometric camera (2:1, tile 64 × 32 px), as in `DESIGN.md` §9 option B. If you use an image-generation model instead, **state the cost and get the owner's go before any paid call.** Keep camera and scale constant; transparent WebP @2x; no baked text.
5. **Redesign in English.** Desktop scene, project drawer (top and bottom), states and motion board, mobile, reduced motion, asset sheet. Raise detail: lighting, materials, props, micro-UI density. Keep the data rules in `DESIGN.md` §8.
6. **Adversarial review.** One independent reviewer pass plus an anti-slop pass before showing anything.
7. **Commit** in small commits on `design/village-v2`, push, and report links. Then stop and ask for validation.

## Hard rules

- No merge to `main`. No PR unless the owner asks.
- No paid generation, no external message, no publication without explicit approval.
- Mark every demo value as demo. No fake percentages. Activity is never a commit, CI run or deploy. Do not assume history APIs exist; App Claude stays "unavailable" until a source is verified.

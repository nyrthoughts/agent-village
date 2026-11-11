# Step 3 brief: build the validated RPG village (for Codex)

Paste this file into a Codex session opened on `nyrthoughts/agent-village`. It is the full brief.

## Where things stand

- **Design validated by the owner**: the detailed RPG village in `design/village-v5/` on branch `design/village-v2` (PR nyrthoughts/agent-village#4). Read `design/village-v5/DESIGN.md`, `../village-v4/DESIGN.md` (layout, chrome, tokens, states) and `../village-v3/DESIGN.md` §8–9 (data rules, camera, layer pipeline). Look at every PNG in `design/village-v5/visuals/`.
- **Data layer done**: PR nyrthoughts/agent-village#3, branch `claude/charming-albattani-osk2ea`, CI green. It reads Codex (CLI, desktop app, IDE), Claude Code (CLI, Claude desktop app, IDE) and Gemini CLI from local files, groups every session by project (`projectResolver.ts`, `projects.yaml`), tags its origin, and takes approval/input signals from Claude Code hooks. `npm run sources:doctor` checks a machine.
- **Verified on the owner's Mac** (doctor run, 2026-11-11): the Codex desktop app writes to `~/.codex` (`originator` = `Codex Desktop`), Claude Code in the Claude desktop app writes to `~/.claude` (`entrypoint` = `claude-desktop`). No Codex approval events were found in 60 recent rollouts, so Codex approval stays unconfirmed. 16 recent Claude sessions are `sdk-cli` (driven by a program, shown as "scripted run").
- **The gap**: native mode still renders `ObservedProjects` (a list) in `src/client/App.tsx`. The village is not in the app yet.

## Goal

Native mode shows the validated village: one house per project, one generated villager per agent, states readable at a glance, the "Needs you" column and the project drawer, exactly as on boards 01–07. Everything is driven by the real data from PR #3.

## Branch

Start from `claude/charming-albattani-osk2ea` (PR #3), create `feat/rpg-village`, and bring in only what you need from `design/village-v2` (`git checkout origin/design/village-v2 -- design/village-v3/blender design/village-v4/blender design/village-v5`). Open a new PR against `main` when done. Do not merge.

## Work, in order

1. **Sprite library (Blender, offline, committed as WebP).** The browser cannot run Blender, so pre-render a library and pick from it at runtime.
   - Install: `python3.13 -m venv .venv && .venv/bin/pip install bpy==5.2.3 pillow numpy` (outside the repo or git-ignored).
   - Villagers: render a fixed set of personas per guild, at least 16 Artisans (Claude Code CLI) and 16 Scholars (Codex), each in the 6 states × 4 frames, same camera and anchor as `v5_render.py states`. Reuse `characters.persona()` with seeds `artisan-00`…`artisan-15` and `scholar-00`…`scholar-15`. Pack each persona into one sprite sheet per state.
   - At runtime an agent gets `persona = hash(source + ":" + sessionId) mod N` within its guild. Same agent, same villager, always. Store an optional owner override (pin or re-roll) next to the plans, never in the repo.
   - Houses: render the village base for a fixed set of lots (the 5-house horseshoe plus 3 more lots, with empty lots shown as plots). Render one house layer per lot and roof colour so a project's house can be swapped or dimmed alone. Keep the 2:1 camera, 1 m = 64 × 32 px, @2x WebP.
   - Fix the two known render bugs first: the black wedge beside the well and the straight edge where the meadow stops.
   - Write `scripts/render-village.md` with the exact commands. Never commit `.blend` files, the venv or PNG intermediates.
2. **Scene component.** Replace `ObservedProjects` in native mode with a village view (keep `ObservedProjects` reachable as the "List" tab). Port `design/village-v5/prototype/app.js` and `ui.css` to React components and CSS in `src/client/`.
   - Layers: base, house layers, villager sprites painter-sorted by `x + y`, HTML overlays (roof plates, emote bubbles, dialogue boxes, name chips), HUD.
   - Project → lot: stable order (most recent activity first fills the horseshoe), more than 8 projects pages to a second map. The Unassigned inbox is a noticeboard on the plaza, not a house.
   - Villager position: at a workstation in its project's yard; up to 5 per house, the rest counted on the roof plate.
   - The Claude app is one closed stall on the plaza; owner-entered links from `projects.yaml` open from it.
3. **State mapping.** Map PR #3 data to the six states: `working` (signal under 2 min), `idle`, `approval` and `input` only from a real signal (Claude hooks; Codex approval only if the doctor ever confirms it), `error` only from a real stop or failure event, `offline` (no recent process and no signal). Never infer a state from text.
4. **Animation.** Sprite-sheet `steps()` and CSS opacity only, timings from board 03. Reduced motion: `prefers-reduced-motion` or the Motion control; walkers wait at their station. Pause off-screen and in hidden tabs.
5. **Chrome.** JRPG windows, ▶ cursor, DotGothic16 (OFL, self-host it), "Needs you" column and project drawer as on boards 01, 02, 02b. Bilingual FR/EN through `src/client/language.ts`. Mobile as board 04.
6. **Tests.** Unit tests for persona selection (stable, guild-correct), lot assignment, state mapping. Extend `e2e/desktop.spec.ts`, `e2e/mobile.spec.ts`, `e2e/reduced-motion.spec.ts` and add one spec that checks every state renders. Keep the public demo (GitHub Pages) on fictional fixtures.

## Hard rules

- `CONTRIBUTING.md` applies: fictional fixtures only, no real names, absolute home paths, transcripts, prompts or secrets in the repo.
- Activity decorates, it never creates or changes progress. No percentages, HP, levels or invented game stats. Activity is never a commit, CI run or deploy.
- Agent Village observes; it never approves, answers or starts an agent. Clicking a villager opens its source.
- No image-generation model, no paid call, nothing taken from Dragon Quest or any other game.
- Before pushing: `npm run typecheck`, `npm test -- --run`, `npm run build`, `node scripts/check-clean.mjs`, `npm audit`, `npm run e2e`. Report real results.

## Done

A PR against `main` with the village live in native mode, screenshots of desktop, a selected project, mobile and reduced motion taken from the real app (not the prototype), and a list of what is verified versus assumed.

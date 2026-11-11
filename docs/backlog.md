# Deferred backlog

These are options, not V1 commitments.

- Inspect `test`, `pr_merged`, `deployed`, and `observed` evidence through pluggable verifiers.
- Add adapters for other local session dashboards without changing the activity contract.
- Generate or update YAML from agent lifecycle hooks after the manual model proves useful.
- Add historical snapshots only if users need trend analysis, not just current recovery context.
- Add shared authentication only if the product moves beyond localhost or a private tailnet.
- Prototype a physical display only after the screen version is used consistently; the same `/api/village` truth can drive LEDs, e-ink, or a miniature building without coupling hardware to the renderer.
- **Claude app chat import.** Claude app (claude.ai, desktop and mobile) chats have no local source. A possible future step is an explicit, owner-run import of the official data export into the private directory, read with the same caps and never fetched. Not built.
- **Other CLIs: Cursor, Aider, OpenCode.** Not built. Each would be one more adapter in `src/server/activity/sources/` (roots, tolerant parser, origin) once its on-disk format can be checked with the sources doctor.

Not possible yet with the current sources:

- **Claude app history.** The Claude desktop/web app exposes no local transcript or supported read interface to this observer, so its chats appear only as links the owner enters in `projects.yaml`, with no state or activity. Claude Code inside the desktop app is different: when it writes to a Claude data folder it is read like the CLI (see the doctor to find that folder).
- **Cloud sessions.** Codex cloud tasks and Claude Code on the web run on remote machines and leave no local journal; they can only be linked in `projects.yaml`.
- **Desktop-app storage.** Where the Codex desktop app and Claude Code in the Claude desktop app keep sessions when not in `~/.codex` or `~/.claude` is not verified. The doctor reports candidate folders and file counts; the owner adds the right one as an extra root.
- **Codex "needs you" on live installs.** Approval-request events are read from rollouts when present, but Codex may not persist them; the doctor counts them so this can be confirmed. Codex has no input-request signal here.
- **Codex repository record on live installs.** The `git_origin_url` index column and the `session_meta` Git record are read when present; they were tested on fictional fixtures, not against every Codex version.
- **Gemini CLI format.** The chat and log layout and the folder hash were implemented from public behaviour and fictional fixtures; the source stays experimental until confirmed with the doctor on a real install.
- **Hook-only sessions.** Lifecycle hooks keep the folder name only, so a session seen only through hooks cannot be resolved until its journal appears.

Explicitly out of scope: agent commands, approvals, prompt inspection, cost accounting, a game engine, and public multi-tenant hosting.

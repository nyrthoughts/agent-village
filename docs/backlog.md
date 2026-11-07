# Deferred backlog

These are options, not V1 commitments.

- Inspect `test`, `pr_merged`, `deployed`, and `observed` evidence through pluggable verifiers.
- Add adapters for other local session dashboards without changing the activity contract.
- Generate or update YAML from agent lifecycle hooks after the manual model proves useful.
- Add historical snapshots only if users need trend analysis, not just current recovery context.
- Add shared authentication only if the product moves beyond localhost or a private tailnet.
- Prototype a physical display only after the screen version is used consistently; the same `/api/village` truth can drive LEDs, e-ink, or a miniature building without coupling hardware to the renderer.

Not possible yet with the current sources:

- **Claude app history.** The Claude desktop/web app exposes no local transcript or supported read interface to this observer, so its chats appear only as links the owner enters in `projects.yaml`, with no state or activity.
- **"Needs you" signals (approval or input requested).** Claude's `Notification` hook fires for permission prompts and idle input, but the observer keeps only the event name and maps it to "waiting"; telling the two apart would mean retaining the notification text, which the hook boundary deliberately strips. Codex approval requests are not read from journals or the index today. Neither is shown until a metadata-only signal can be verified.
- **Codex repository record on live installs.** The `git_origin_url` index column and the `session_meta` Git record are read when present; they were tested on fictional fixtures, not against every Codex version. A `session_meta` line beyond the 4 MiB journal tail is not seen.
- **Hook-only sessions.** Lifecycle hooks keep the folder name only, so a session seen only through hooks cannot be resolved until its journal appears.

Explicitly out of scope: agent commands, approvals, prompt inspection, cost accounting, a game engine, and public multi-tenant hosting.

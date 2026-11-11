# Architecture

Agent Village separates construction from activity. A busy agent cannot silently complete a milestone.

## Native construction

The owner defines a stable goal and up to twelve milestones in each project. `/api/plan` requires the owner's passkey session and exact canonical Origin. A bounded JSON ledger in the private auth directory stores goals, validation notes, timestamps and revisions. Writes are synchronous and atomic in the single server process. Revision conflicts fail instead of overwriting another edit.

No plan means an undefined survey plot. A plan with no validated milestone means foundations. Partial validated milestones create frame, walls and roof stages. All explicitly validated milestones complete the house; reopening one removes completion. Owner checks and agent-recorded local checks remain labelled by provenance. Neither is an automatic test/deployment verification service.

The project set is the union of recent conversations and saved goals. A project keeps its construction when it has no recent activity. Hook-only temporary identities are excluded from plan creation until a native project is identified.

## Project resolution

`projectResolver.ts` decides which project each lead session belongs to and records why (`matchedBy`: `rule`, `remote`, `git-root`, `folder` or `unassigned`, plus the matched value). Resolution is pure: Git facts (common directory, worktree top level, normalised `origin`) come from an injected probe, cached per directory for five minutes. Order, first match wins: owner rule from `projects.yaml` (session id, longest path prefix, remote, title regex), normalised remote (live, else recorded by Codex), Git common directory, working directory, then the Unassigned inbox for catch-all directories and folderless sessions. Git is probed before rules apply, except for a catch-all directory when no rule declares a remote; the legacy key used to carry saved plans is the Git root. The manifest format is in [connections](connections.md#owner-manifest).

Grouping is presentation only. It never creates or validates milestones. Saved goals are keyed by project id; when a session's key changes (for example from a clone path to its remote), its plan is moved only when the move is unambiguous: one new project claims it, the target has no plan, and no session still resolves to the old key. Owner-entered chat links are displayed, never fetched.

## YAML construction

YAML modes retain `workspace → project → feature → task → subtask`. A task is a building and subtasks are its construction leaves. Zod validates input before deterministic derivation. Empty containers are planned, never verified. The most attention-demanding child status rolls upward; blocked/review states are distinct from physical construction.

V1 verifies commit existence and approved human review. Other represented evidence types remain `not_checked_v1`. A commit's existence alone does not prove a deployed or working result.

## Activity

Local sources are adapters in `src/server/activity/sources/`. Each declares an id, a label, whether it is experimental, the `roots()` it reads (tool default or its override variable, `VILLAGE_*` extra roots, then `projects.yaml` `sources:`), and `collect()`, which returns lead sessions with resolver facts (cwd, titles, recorded remote), timestamps, state, an `origin` (`cli`, `desktop`, `ide`, `exec`, `cloud`, `unknown`) and helpers that carry only a `parentId`. `LocalSessions` runs every adapter, resolves leads through the project resolver, places hashed Gemini folders against folders already seen, gives helpers their lead's project and reports per-source status (supported, experimental, unavailable). Adapters never choose a project and never read beyond their caps (`VILLAGE_SESSION_LIMIT` leads per source, default 120; seven days; 4 MiB tails).

Codex uses each root's read-only SQLite index and bounded rollout tails, not an app-server process, and falls back to the rollout files when a root has no index. It adds helper metadata from parent-child edges, with a 200-record/depth-eight cap. Child journals are not read. Claude uses journals, process metadata and optional authenticated lifecycle hooks. Gemini CLI (experimental) uses saved chat files whose folder is known only by hash. OpenClaw has an optional metadata-only hook plugin. `npm run sources:doctor` reuses the adapters' roots and parsers to print counts and client identifiers only.

"Needs you" is a separate `attention` field (`approval` or `input`, with a time), set only from structured events: Claude hook notifications by type and `PermissionRequest`, and Codex approval-request events (unverified). Text is never used, and a later event of the same session clears it. Like all activity, it decorates a session and never touches milestones.

Detected records, recent events and observed processes have different provenance. An open edge never establishes active work. Recent means within two minutes. Claude process confirmation combines PID presence and a recent declared status; later lifecycle events win. Hook coverage starts at server startup and expires after thirty minutes. Errors and caps are visible; available workers remain visible during partial source failures.

One house displays at most five people, while badges and analytics count all observed helpers. Adult leads and child helpers stay distinct from decorative animals. Reading a person's details opens its source conversation.

## Runtime and privacy

- Original SVG pixel artwork, six silhouettes and physical construction layers; no external assets or game engine.
- Ground click walks, building click opens details; arrows walk, Shift+arrows or drag pan the bounded camera.
- Two decorative animals use CSS-only patrols paused offscreen, in hidden tabs and under reduced motion.
- Polling pauses in hidden tabs. Stable geometry keeps walking routes through refreshes.
- Node binds IPv4 loopback. Native APIs require owner access; fictional demo/YAML modes do not.
- Project plans and auth state stay outside the source tree and static output. Public builds use fictional fixtures only.
- No agent commands, remote transcript bridge, token accounting or model inference service.

Known tradeoff: the ledger is a small single-process store, not a multi-user database or a cross-process collaborative editor. Unsupported metrics remain unmeasured rather than estimated.

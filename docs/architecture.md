# Architecture

Agent Village separates construction from activity. A busy agent cannot silently complete a milestone.

## Native construction

The owner defines a stable goal and up to twelve milestones in each project. `/api/plan` requires the owner's passkey session and exact canonical Origin. A bounded JSON ledger in the private auth directory stores goals, validation notes, timestamps and revisions. Writes are synchronous and atomic in the single server process. Revision conflicts fail instead of overwriting another edit.

No plan means an undefined survey plot. A plan with no validated milestone means foundations. Partial validated milestones create frame, walls and roof stages. All explicitly validated milestones complete the house; reopening one removes completion. Owner checks and agent-recorded local checks remain labelled by provenance. Neither is an automatic test/deployment verification service.

The project set is the union of recent conversations and saved goals. A project keeps its construction when it has no recent activity. Hook-only temporary identities are excluded from plan creation until a native project is identified.

## YAML construction

YAML modes retain `workspace → project → feature → task → subtask`. A task is a building and subtasks are its construction leaves. Zod validates input before deterministic derivation. Empty containers are planned, never verified. The most attention-demanding child status rolls upward; blocked/review states are distinct from physical construction.

V1 verifies commit existence and approved human review. Other represented evidence types remain `not_checked_v1`. A commit's existence alone does not prove a deployed or working result.

## Activity

Native mode uses Codex's read-only SQLite index and bounded root journal tails, not an app-server process. It adds helper metadata from parent-child edges, with a 200-record/depth-eight cap. Child journals are not read. Claude uses journals, process metadata and optional authenticated lifecycle hooks. OpenClaw has an optional metadata-only hook plugin.

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

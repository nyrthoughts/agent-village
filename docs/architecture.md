# Architecture

Agent Village has two independent data planes so activity can never masquerade as progress.

```text
village.yaml ── schema ── evidence verifiers ── status derivation ── /api/village
                                                                     │
Codex app-server ─┐
Claude hooks ─────┼── allowlist/redaction/mapping ────── /api/activity
OpenClaw plugin ──┤
local AMC endpoint┘
                                                                     │
                                      React scene polls both every 5 seconds
```

## Truth plane

`village.yaml` owns the work hierarchy and recovery context:

```text
workspace
└── project       → district
    ├── feature   → compound
    │   └── task  → building
    │       └── subtask → verified construction leaf
    └── task      → standalone building
```

The server validates the complete file with Zod before deriving anything. Evidence verifiers return `verified`, `pending`, `invalid`, or `not_checked_v1`. Derivation is pure and rolls the most attention-demanding child status upward. An empty container is planned, never verified.

Construction and attention are separate deterministic signals:

| Verified construction | Building stage |
| --- | --- |
| no verified leaf, planned | lot |
| no verified leaf, started | foundation |
| early verified leaves | frame |
| partial verified leaves | walls |
| every leaf verified, parent not proven | roof |
| task and every leaf proven | complete |

`blocked`, `awaiting_review`, and other effective states remain overlays. A blocked task can therefore retain a frame or walls already proven by its subtasks.

Only `commit` and `human_review` evidence are inspected in V1. A verified claim without verified evidence is downgraded.

## Activity plane

Native mode aggregates three local, read-only sources. The Codex provider requests `thread/list` from a short-lived `codex app-server` process. Claude Code command hooks POST lifecycle and subagent events to a loopback route. The bundled OpenClaw plugin posts normalized lifecycle metadata. The hub keeps session ID, provider-honest role, parent ID when known, normalized tool/state, redacted title, project folder name, and timestamps. Explicit title mappings attach people to task IDs.

The separate live adapter reads `{ sessions: [...] }` from another loopback HTTP endpoint. Native provider failures are isolated: one unavailable tool does not hide the others.

Activity has a hard 800 ms timeout. Invalid, unavailable, or non-local sources yield an empty degraded snapshot. They do not alter `/api/village`, derived states, or the scene's buildings.

## Runtime

- React and CSS render a semantic top-down tile map. Buildings and people are native buttons, not mirrored canvas controls.
- Stable task-ID hashing selects one of eight original architectural families. Server-derived `data-stage` attributes reveal the correct construction parts.
- The camera is a bounded CSS translation controlled by drag, wheel, or arrow keys.
- The client polls truth and activity every 5 seconds, pauses in hidden tabs, and retains the last known truth on failure.
- Truth polling updates construction; activity polling updates people only.
- The Node HTTP server serves the built SPA and read-only JSON APIs on `127.0.0.1` only.
- Demo, truth-only, native, and live modes use the same UI contract.

## Why this stays small

YAML is reviewable, portable, and sufficient for a personal or small-team dashboard. HTTP polling is observable and easy to recover. A game engine, database, event bus, and agent-control layer would add operational cost before they improve the core job: knowing what is done, what needs attention, and how to resume it.

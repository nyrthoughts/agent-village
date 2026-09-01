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
    │       └── subtask → floor
    └── task      → standalone building
```

The server validates the complete file with Zod before deriving anything. Evidence verifiers return `verified`, `pending`, `invalid`, or `not_checked_v1`. Derivation is pure and rolls the most attention-demanding child status upward. An empty container is planned, never verified.

The visual grammar is deterministic:

| Effective state | Visual |
| --- | --- |
| `planned` | ghost blueprint |
| `in_progress` | exposed frame |
| `blocked` | coral scaffold |
| `awaiting_review` | amber review flag |
| `verified` | solid material and roof |

Only `commit` and `human_review` evidence are inspected in V1. A verified claim without verified evidence is downgraded.

## Activity plane

Native mode aggregates three local, read-only sources. The Codex provider requests `thread/list` from a short-lived `codex app-server` process. Claude Code command hooks POST lifecycle events to a loopback route. The bundled OpenClaw plugin posts normalized lifecycle metadata. The hub keeps session ID, normalized tool/state, redacted title, project folder name, and timestamp. Explicit title mappings attach workers to task IDs.

The separate live adapter reads `{ sessions: [...] }` from another loopback HTTP endpoint. Native provider failures are isolated: one unavailable tool does not hide the others.

Activity has a hard 800 ms timeout. Invalid, unavailable, or non-local sources yield an empty degraded snapshot. They do not alter `/api/village`, derived states, or the scene's buildings.

## Runtime

- One React-owned Three.js renderer draws the procedural WebGL scene. It uses an orthographic camera with fixed azimuth/elevation, bounded zoom, and ground-plane panning.
- Projected HTML buttons mirror every task building for keyboard access and open the same detail drawer as canvas picking. The existing semantic table is the WebGL fallback.
- The renderer caps device pixel ratio at 1.75 and renders on state/input changes rather than running a permanent animation loop.
- The client polls truth and activity every 5 seconds, pauses in hidden tabs, and retains the last known truth on failure.
- Identical truth polling results do not rebuild the 3D world. Activity updates replace worker markers only and dispose their owned materials.
- The Node HTTP server serves the built SPA and read-only JSON APIs on `127.0.0.1` only.
- Demo, truth-only, native, and live modes use the same UI contract.

## Why this stays small

YAML is reviewable, portable, and sufficient for a personal or small-team dashboard. HTTP polling is observable and easy to recover. A game engine, database, event bus, and agent-control layer would add operational cost before they improve the core job: knowing what is done, what needs attention, and how to resume it.

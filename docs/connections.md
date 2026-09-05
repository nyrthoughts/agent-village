# Connections

Agent Village observes existing work. It never starts, stops, approves or instructs agents. Native reports are source claims, not verified delivery metrics.

## Prepare private access

Build and prepare the first owner before starting native mode:

```sh
npm ci
npm run build
npm run auth:setup
VILLAGE_MODE=native npm start
```

Open `http://localhost:4180` and enroll using the private bootstrap file reported by setup. The code lasts 15 minutes; registration requires user verification and consumes it. Setup cannot overwrite an enrolled owner. Sessions stay in page memory for 30 minutes; reloading requires another login. See [owner access](owner-access.md).

Setup also creates `ingestion.header`, a separate observation-only authorization header. It cannot read projects or authenticate a person. The default private directory is `~/.local/share/agent-village`; use the same `VILLAGE_AUTH_DIR` for setup, server and connectors if overriding it. Do not paste secrets into shared commands, repository files or messages.

## Codex

Native mode uses `sqlite3 -readonly` against the existing `~/.codex/state_5.sqlite`, then reads selected local JSONL transcript tails. It does not start `codex app-server` or require an API key or running Codex CLI.

It selects up to 60 non-archived root tasks updated in the last seven days. Journal reads are capped at 4 MiB and displayed history at 24 user requests/assistant reports per session. Reasoning and tool payloads are excluded. Old activity becomes idle rather than implying an agent still runs.

Snapshots are cached for five seconds; unchanged transcript tails are reused in memory. Restarts reread original sources. No additional conversation database exists, and remote Codex sessions are not connected implicitly.

## Claude Code

Existing conversations need no hooks. Native mode reads recent journals below `~/.claude/projects` and allowlisted process metadata below `~/.claude/sessions`. It selects up to 60 sessions, preferring running processes; those may be older than seven days. Existing tmux metadata appears when available. Agents need not restart.

After first-time `auth:setup`, optional lifecycle hooks can be installed with:

```sh
npm run connect:claude
```

The installer atomically updates Claude settings, preserves unrelated hooks and upgrades only Agent Village's marked commands. Curl loads authorization from the private header file; the secret value is not placed in settings or command arguments. Unknown events and missing/incorrect authorization are rejected. Only allowlisted lifecycle metadata is retained in a bounded in-memory store.

`SubagentStart` attaches a helper beside its lead; `SubagentStop` removes it. Short hook timeouts keep observation failures from interrupting Claude.

For a custom port, set `AGENT_VILLAGE_HOOK_URL` to the loopback URL with the exact `/api/hooks/claude` path. Pass the server's `VILLAGE_AUTH_DIR` when changing its location. These variables must be present when installing or updating hooks.

Remove only Agent Village hooks with:

```sh
npm run disconnect:claude
```

The disposable launcher installs no hooks and deletes its temporary ingestion header on exit. Use the installed runtime for a lasting connector configuration.

## OpenClaw

After preparing private access, install the bundled plugin on the same computer as the server and OpenClaw Gateway:

```sh
openclaw plugins install ./integrations/openclaw
```

The plugin reads the private ingestion header and observes `session_start`, `before_agent_run`, `agent_end` and `session_end`. It reports lifecycle metadata only, never messages, prompts, tool calls or outputs. It refuses non-loopback destinations and redirects. OpenClaw is optional and is not installed by Agent Village.

Set `AGENT_VILLAGE_URL` to the server's loopback base URL for a custom port. The Gateway process must receive the matching `VILLAGE_AUTH_DIR` if overriding its location. A remote Gateway cannot access this local-only server; do not add a tunnel to connect one.

## Group projects and inspect sources

Native mode groups conversations by local directory and common Git repository. `VILLAGE_PROJECT_ALIASES` can map directories, `session:codex:ID`, `session:claude:ID` or `title:PREFIX` to a shared display name. Keep real path mappings outside the repository. `VILLAGE_FOCUS_PROJECTS` selects displayed project names; authenticated search still exposes others.

Each native project opens a brief, timeline and source conversations. Briefs extract explicit done/next/blocker sections without calling a model or independently verifying claims. Unsupported token counts, duration estimates and delivery percentages are omitted. Browser storage retains reading-point IDs/timestamps and language, not conversation text or owner tokens.

In YAML/demo/live modes, `activity_mapping` places a worker beside an evidence-based task using a case-insensitive title substring:

```yaml
activity_mapping:
  - match: example project
    taskId: example-release
```

Mapping changes position only. These task stages come from evidence verification; native houses organize observed conversations instead. The GitHub demo is fictional and never reads local sessions. See [security](../SECURITY.md) for same-account malware, shared-session and other limits.

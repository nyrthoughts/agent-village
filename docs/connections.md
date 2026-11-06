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

`fs.watch` on `~/.codex/sessions` and the index directory triggers a debounced (250 ms) refresh; a 5-second poll remains the safety net. Unchanged transcript tails are reused in memory. Each refresh is turned into events by diff against the projection, so a restart rereads sources without recreating entries. The event journal stores bounded, allowlisted excerpts in the private directory; remote Codex sessions are not connected implicitly. Whether the Codex app writes the same files as the CLI, and whether the installed Codex supports a `notify` hook, has not been verified; no `connect:codex` script is provided.

Parent-child edges add up to 200 helper metadata records at depth eight. Helpers inherit the root project's identity. Child transcripts are never opened by this collector. Existing/open edges mean detected, not active; a recent index timestamp means recent, not confirmed work. Source coverage and collection caps are shown in the UI.

## Claude Code

Existing conversations need no hooks. Native mode reads recent journals below `~/.claude/projects` and allowlisted process metadata below `~/.claude/sessions`. It selects up to 60 sessions, preferring running processes; those may be older than seven days. Existing tmux metadata appears when available. Agents need not restart.

After first-time `auth:setup`, optional lifecycle hooks can be installed with:

```sh
npm run connect:claude
```

The installer atomically updates Claude settings, preserves unrelated hooks and upgrades only Agent Village's marked commands. Curl loads authorization from the private header file; the secret value is not placed in settings or command arguments. Unknown events and missing/incorrect authorization are rejected. Only allowlisted lifecycle metadata is journaled (session, event name, helper identifiers, a directory basename as display hint); prompts, tool inputs/outputs and other extras are dropped before storage. Hooks reach open boards immediately through the stream.

Each hook command sends a delivery identity (`uuidgen`, or the Linux kernel UUID) and its UTC time as `x-village-event-id` / `x-village-occurred-at` headers; Claude's payload is unchanged. A retry with the same identity, or a tool event with the same `tool_use_id`, is recorded once whatever its delay or a server restart. Hooks installed by an older version send no identity: their retries are merged only within the same second. Run `npm run connect:claude` again to upgrade the marked commands.

`SubagentStart` records a helper under its lead; `SubagentStop` marks it idle. A `Notification` (permission or input request) puts the session under **For you**. Hook coverage starts when the server runs; a hook older than two minutes cannot keep claiming active work. Short hook timeouts keep observation failures from interrupting Claude. Confirmed process metadata requires a present PID and recent declared state; a newer Stop hook supersedes an older busy state.

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

The plugin reads the private ingestion header and observes `session_start`, `before_agent_run`, `agent_end` and `session_end`. It reports lifecycle metadata only, never messages, prompts, tool calls or outputs, with one delivery identity and time per event; a failed delivery is retried once with the identical body. It refuses non-loopback destinations and redirects. OpenClaw is optional and is not installed by Agent Village.

Set `AGENT_VILLAGE_URL` to the server's loopback base URL for a custom port. The Gateway process must receive the matching `VILLAGE_AUTH_DIR` if overriding its location. A remote Gateway cannot access this local-only server; do not add a tunnel to connect one.

## GitHub (optional, per repository)

```sh
VILLAGE_GITHUB_REPOS='["owner/name"]' VILLAGE_GITHUB_INTERVAL_MS=45000 VILLAGE_MODE=native npm start
```

Nothing is polled unless repositories are listed. The periodic source runs `gh api --method GET --include` with `If-None-Match` ETags (a 304 costs no rate-limit quota) every 30–60 seconds while an owner session is active: the head commit of the default branch and of up to five branches that observed sessions of this repository are on, check runs for each exact SHA (up to three pages of 100; a partial read or an unrecognized conclusion is `unknown`, never green), the ten most recently updated pull requests (with the merge commit) and the three latest deployments with their newest status. Text is redacted before storage; links are kept only as GitHub returned them and only without credentials; none is constructed. Facts attach to a project by repository and observed branch, then exact SHA, so the default branch's CI never proves a feature branch. CI from another attributed SHA than the head is shown as such. A branch that no longer exists on GitHub is reported as a warning. Failures (missing `gh`, no authentication, HTTP errors) appear in the source bar with their time. Private-repository access and deployment visibility depend on your `gh` token and were not verified here.

## Group projects and inspect sources

Native mode groups conversations by local directory and common Git repository; the normalized GitHub remote is kept as an attribute. `VILLAGE_PROJECT_ALIASES` can map directories, `session:codex:ID`, `session:claude:ID` or `title:PREFIX` to a shared display name; a `session:` alias also attaches a hook-only session. Keep real path mappings outside the repository.

Hook sessions without a trusted identity appear under **Unmatched**. Attaching one to a known project writes `project-mappings.json` (0600) in the private directory and takes effect immediately. Names and directory basenames are never compared automatically.

Each project row and detail show sourced facts with their provenance (declared, observed, verified) and exact time. Briefs extract explicit done/next/blocker sections without calling a model. Resume commands (`codex resume ID`, `claude --resume ID`) are suggestions to copy; the board never runs them. Browser storage retains language, visit sequence numbers and seen/snoozed item identifiers only.

YAML modes keep `activity_mapping`, which attaches an AMC worker to an evidence-based task by case-insensitive title substring:

```yaml
activity_mapping:
  - match: example project
    taskId: example-release
```

The GitHub Pages demo is fictional and never reads local sessions. See [security](../SECURITY.md) for same-account malware, shared-session and other limits.

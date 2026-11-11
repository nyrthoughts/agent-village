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

## Local sources

Every source is read from local files only, through one adapter per tool (`src/server/activity/sources/`). Each adapter lists the roots it reads; all sessions then go through the same project resolution. Common limits: up to 120 lead sessions per source (`VILLAGE_SESSION_LIMIT`, 10–500; the doctor says when it hides sessions), updated in the last seven days, journal reads capped at 4 MiB, 24 displayed exchanges per session, no reasoning or tool payloads. A tool that is not installed shows as **unavailable** in the header rather than as an error. Sessions are tagged with their **origin** when the tool records it: CLI, desktop app, IDE, scripted run (`exec`, SDK) or cloud; anything else stays unknown.

| Source | Status | Roots read (in order) | Origin field |
| --- | --- | --- | --- |
| Codex CLI, desktop app, IDE extension | supported | `CODEX_HOME` or `~/.codex`; `VILLAGE_CODEX_HOMES`; `sources.codex.homes` | `session_meta.originator` and `source` |
| Claude Code CLI, desktop app, IDE | supported | `CLAUDE_CONFIG_DIR` or `~/.claude`; `VILLAGE_CLAUDE_DIRS`; `sources.claude.dirs` | `entrypoint` on journal lines and process records |
| Gemini CLI | experimental | `~/.gemini`; `VILLAGE_GEMINI_DIRS`; `sources.gemini.dirs` | always CLI |

`VILLAGE_*` variables are comma-separated absolute or `~/` paths, read by the server at startup. The `sources:` lists live in `projects.yaml` (see [owner manifest](#owner-manifest)) and are re-read when the file changes. Use them when a desktop app keeps its own copy of the tool's data directory: run the doctor below to find it.

### What is verified and what is assumed

- **Verified on live installs** (doctor output on macOS, counts and identifiers only):
  - The **Codex desktop app** writes its threads to `~/.codex` like the CLI: `state_5.sqlite` and rollouts, with `originator` = `Codex Desktop` and `source` = `vscode` (lead threads) or `subagent` (helpers). These are shown as *desktop app*. No extra root is needed.
  - **Claude Code in the Claude desktop app** writes its journals to `~/.claude` like the CLI, with `entrypoint` = `claude-desktop` (*desktop app*). `sdk-cli` (sessions driven through the Agent SDK) is shown as *scripted run*, `cli` as *CLI*, and `remote_desktop` (a cloud session started from the desktop app) as *cloud*.
  - Journal lines carry `cwd`, `entrypoint`, `userType` and `version`; process records carry `entrypoint`.
  - `~/Library/Application Support/Claude` and `…/Codex` hold app state as `*.json` files, not sessions; they are not read.
- **Tested on fictional fixtures only:** the Codex index columns (`git_origin_url`, `source`), rollout files read without an index, the Claude entrypoint `claude-vscode`, and the whole Gemini format. Unknown originator or entrypoint strings stay *unknown* instead of being guessed; the doctor prints them so the mapping can be extended.
- **Not known:** where the Codex desktop app and Claude Code in the Claude desktop app store sessions when they do not use `~/.codex` or `~/.claude`. The doctor checks the usual application folders and only reports what exists.
- **Not on disk:** Codex cloud tasks, Claude Code on the web and other cloud sessions run elsewhere and leave no local journal. Claude app (claude.ai) chats have no local source either. Add any of them as `links` in `projects.yaml`.

### Codex

Native mode uses `sqlite3 -readonly` against each root's `state_5.sqlite`, then reads selected local JSONL transcript tails. It does not start `codex app-server` or require an API key or running Codex CLI. A root without a readable index is still read: rollout files below `sessions/` changed in the last seven days are parsed directly (no index titles, no helpers, helper rollouts skipped). Long rollouts also read their first line for the working directory, origin and recorded repository.

Snapshots are cached for five seconds; unchanged transcript tails are reused in memory. Restarts reread original sources. No additional conversation database exists.

Parent-child edges add up to 200 helper metadata records at depth eight. Helpers inherit the root project's identity. Child transcripts are never opened by this collector. Existing/open edges mean detected, not active; a recent index timestamp means recent, not confirmed work. Source coverage and collection caps are shown in the UI.

### Claude Code

Existing conversations need no hooks. Native mode reads recent journals below `<root>/projects` and allowlisted process metadata below `<root>/sessions` for every root. It selects up to `VILLAGE_SESSION_LIMIT` sessions (default 120), preferring running processes; those may be older than seven days. Existing tmux metadata appears when available. Agents need not restart.

After first-time `auth:setup`, optional lifecycle hooks can be installed with:

```sh
npm run connect:claude
```

The installer atomically updates Claude settings (`CLAUDE_SETTINGS_PATH`, else `settings.json` in `CLAUDE_CONFIG_DIR` or `~/.claude`), preserves unrelated hooks and upgrades only Agent Village's marked commands. Run it again after upgrading Agent Village so new events are registered. Curl loads authorization from the private header file; the secret value is not placed in settings or command arguments. Unknown events and missing/incorrect authorization are rejected. Only allowlisted lifecycle metadata is retained in a bounded in-memory store. Hook commands discard their output and always exit 0, so they never answer a permission request; `PreToolUse` adds one loopback request (at most 0.25 s) before each tool call.

`SubagentStart` attaches a helper beside its lead; `SubagentStop` removes it. Coverage starts with the observer process and expires after thirty minutes; a hook older than two minutes cannot keep claiming active work. Short hook timeouts keep observation failures from interrupting Claude. Confirmed process metadata requires a present PID and recent declared state; a newer Stop hook supersedes an older busy state.

For a custom port, set `AGENT_VILLAGE_HOOK_URL` to the loopback URL with the exact `/api/hooks/claude` path. Pass the server's `VILLAGE_AUTH_DIR` when changing its location. These variables must be present when installing or updating hooks.

Remove only Agent Village hooks with:

```sh
npm run disconnect:claude
```

The disposable launcher installs no hooks and deletes its temporary ingestion header on exit. Use the installed runtime for a lasting connector configuration.

### Gemini CLI (experimental)

Gemini CLI saves chats as `<root>/tmp/<hash>/chats/*.json` (older versions: user prompts only in `<root>/tmp/<hash>/logs.json`), where `<hash>` is the SHA-256 of the folder it was started in; the folder itself is not stored. Agent Village reads the session id, start and last update, user and model message counts, user and model text (never thoughts or tool calls) and uses the first prompt as the title. Files above 4 MiB contribute metadata only.

To place a session, the hash is compared with folders already known: working directories from Codex and Claude, their parent folders, Git roots probed for them and every `paths` entry of `projects.yaml`. A hash that matches none goes to the Unassigned inbox with its first twelve characters as evidence; add the folder to a project's `paths` to place it. There is no process signal, so Gemini sessions are never shown as working. No documented override of the Gemini data folder is known; use `VILLAGE_GEMINI_DIRS` if yours lives elsewhere. The format was implemented from public behaviour and fictional fixtures, which is why the source is labelled experimental.

### Needs-you signals

Approval and input requests are shown only from structured events, never inferred from text, and only their kind and time are kept.

- **Claude Code (hooks; event names from the hook documentation, tested on fixtures):** `Notification` with `notification_type` `permission_prompt` and `PermissionRequest` mean approval; `idle_prompt` and `elicitation_dialog` mean input. The notification message is discarded. A later `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SessionStart` or `SessionEnd` for the same session clears it. Requires `npm run connect:claude`; hook state expires after thirty minutes.
- **Codex (journal, unverified):** rollout `event_msg` entries `exec_approval_request` and `apply_patch_approval_request` mark an approval while no later activity is recorded. Codex may not write these events to its rollouts at all; on the first live install checked, none appeared in 60 recent desktop-app rollouts, so treat Codex approval as unconfirmed. The doctor keeps counting them.

### Check what is found: sources doctor

```sh
npm run sources:doctor
```

It is read-only and offline. For each source and root it prints whether the root exists (home shown as `~`), session files from the last seven days, parse failures, the origin breakdown with the raw Codex `originator`/`source` and Claude `entrypoint` strings, Codex approval-request event counts, which Agent Village Claude hooks are installed, and how many Gemini hashes are resolved. It also checks known desktop-app folders for your OS (`~/Library/Application Support/Claude` and `…/Codex` on macOS, `~/.config/Claude` and `~/.config/Codex` on Linux, `%APPDATA%\Claude`, `%LOCALAPPDATA%\AnthropicClaude` and the Codex equivalents on Windows) and reports only whether they exist and how many `*.json`/`*.jsonl` files they hold. It never prints titles, prompts or replies.

Send the output back as is when a source is missing sessions or shows unknown origins. If a desktop-app folder holds `*.jsonl` files that look like sessions, add that folder as an extra root (`VILLAGE_CODEX_HOMES`, `VILLAGE_CLAUDE_DIRS` or `sources:`) and run the doctor again.

## OpenClaw

After preparing private access, install the bundled plugin on the same computer as the server and OpenClaw Gateway:

```sh
openclaw plugins install ./integrations/openclaw
```

The plugin reads the private ingestion header and observes `session_start`, `before_agent_run`, `agent_end` and `session_end`. It reports lifecycle metadata only, never messages, prompts, tool calls or outputs. It refuses non-loopback destinations and redirects. OpenClaw is optional and is not installed by Agent Village.

Set `AGENT_VILLAGE_URL` to the server's loopback base URL for a custom port. The Gateway process must receive the matching `VILLAGE_AUTH_DIR` if overriding its location. A remote Gateway cannot access this local-only server; do not add a tunnel to connect one.

## Group projects and inspect sources

One project often has several agents and chats across tools, folders, worktrees and clones. Native mode resolves every lead session to one project; the first match wins:

1. **Your rule** from `projects.yaml` (below). Within rules: explicit session id, then path prefix (longest wins, so a monorepo subfolder can be its own project), then Git remote, then title regular expression.
2. **Same Git remote.** The `origin` URL is normalised: `git@github.com:org/repo.git`, `https://github.com/org/repo` and `ssh://git@github.com/org/repo` all become `github.com/org/repo`, so separate clones merge. Credentials and ports are dropped. When the folder no longer exists, Codex's own record is used: the index's `git_origin_url` column when that Codex version has it, or the `session_meta` Git record when it is inside the bounded journal tail.
3. **Same Git repository.** The common Git directory maps worktrees, including `.claude/worktrees/`, to the main checkout. A removed Claude worktree still maps to its parent.
4. **Same folder**: the working directory.
5. **Unassigned.** A session in a catch-all directory (by default `~`, `/tmp` and anything under it, `/private/tmp`) or without a recorded folder goes to an inbox instead of becoming a project. A catch-all directory is never a project, even if it is a Git repository; a real repository under `/tmp` keeps its identity, and a `remotes:` rule still claims a catch-all directory that is that repository. A Gemini session whose folder hash matches no known folder lands here too.

Git is probed before rules are applied (skipped only for a catch-all directory when no rule declares a remote), so a `remotes:` rule sees the live remote and a regrouped session records its Git root as its previous key. Helpers inherit their lead's project and provenance. Sessions known only from lifecycle hooks keep a temporary identity until Codex or Claude reports their folder. Each conversation shows its provenance ("matched by your rule", "same git remote", ...) and the value that matched. Paths are shown relative to `~`.

### Owner manifest

Create `projects.yaml` in the private directory (`VILLAGE_AUTH_DIR`, default `~/.local/share/agent-village`), owned by you and not writable by others (`chmod 600`). It is re-read when it changes. All fields except `name` are optional:

```yaml
projects:
  - name: Warehouse
    remotes: [github.com/demo-org/warehouse]          # host/owner/repo or any clone URL
    paths: [~/code/monorepo/packages/warehouse]       # absolute or ~/ prefixes
    titles: ["^warehouse:"]                           # case-insensitive, title or first prompt
    sessions: [codex:abc123, claude:0000-demo, gemini:demo-1]  # ids shown under each conversation
    links:                                            # chats the app cannot read; never fetched
      - { title: Pricing brainstorm, url: "https://claude.ai/chat/...", source: claude-app }
catchAll: [~, /tmp/**]   # replaces the defaults; `/**` also covers subfolders
sources:                 # extra local roots, read after the defaults and VILLAGE_* variables
  codex: { homes: [~/alt/.codex] }
  claude: { dirs: [~/alt/.claude] }
  gemini: { dirs: [~/alt/.gemini] }
```

`source` is `claude-app`, `chatgpt` or `other`; link URLs must use `https`. A project with only links still appears. A rule on a catch-all directory matches that directory only. An invalid manifest is reported in the warning banner with the failing field; automatic grouping keeps working without it.

`VILLAGE_PROJECT_ALIASES` still works and is migrated into rules after the manifest's: a directory becomes a path rule (now a prefix), `session:codex:ID` or `session:claude:ID` a session rule and `title:PREFIX` an anchored title rule. Saved goals follow a regrouped project when exactly one new project claims them and no session still belongs to the old one (a rule that splits one session out of a folder project leaves the plan with the folder); otherwise they stay visible under their old name. The Unassigned inbox cannot hold a plan. Keep real path mappings outside the repository. `VILLAGE_FOCUS_PROJECTS` selects displayed project names; authenticated search still exposes others.

Each native project opens a private goal/milestone panel, agent counts, a brief, timeline and source conversations. Briefs extract explicit done/next/blocker sections without calling a model or independently verifying claims. Unsupported token counts and duration estimates are labelled unmeasured. Browser storage retains reading-point IDs/timestamps and language, not conversation text, project plans or owner tokens.

In YAML/demo/live modes, `activity_mapping` places a worker beside an evidence-based task using a case-insensitive title substring:

```yaml
activity_mapping:
  - match: example project
    taskId: example-release
```

Mapping changes position only. YAML task stages come from evidence verification; native house stages come from explicit private milestone validations, separately from observed conversations. The GitHub demo is fictional and never reads local sessions. See [security](../SECURITY.md) for same-account malware, shared-session and other limits.

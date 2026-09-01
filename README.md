# Agent Village

Agent Village turns parallel agent work into a small construction village you can read in seconds.

![Agent Village desktop preview](docs/preview-desktop.png)

Projects are districts, features are compounds, tasks are buildings, verified subtasks advance construction, and active agent sessions are people. The important boundary is deliberate: **evidence builds the village; activity only shows who is nearby**.

## What V1 does

- Renders `workspace → project → feature → task → subtask` as an original top-down pixel village.
- Advances every building through lot, foundation, frame, walls, roof, and complete stages from verified work only.
- Assigns one of eight stable architectural families to each task without imported game assets.
- Keeps blocked and review markers independent from how much of a building is already constructed.
- Shows lead agents as full-sized people and helper agents as smaller people with a count above their lead.
- Opens buildings and people independently for recovery context and honest analytics.
- Reports progress and remaining work; unsupported token and active-time metrics say `Unavailable` instead of inventing zeroes.
- Supports bounded panning, keyboard navigation, reduced motion, and a mobile attention list.
- Connects Codex through its read-only app-server API, Claude Code through hooks, and OpenClaw through an observation-only plugin.
- Optionally accepts redacted sessions from another local AMC-compatible endpoint.
- Keeps the last known truth visible when activity disappears.
- Publishes a safe static demo without exposing local agent data.

## Quick start

Requirements: Node.js 20.19+ and npm.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The default fixture is fictional and safe to publish.

To run the production build locally:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:4180`.

Drag the map or use the arrow keys to explore it. Select a house or person to open its field record.

## Connect your work

Copy `fixtures/village.demo.yaml`, replace the fictional content, and point the server at it:

```sh
VILLAGE_FILE=/absolute/path/to/village.yaml VILLAGE_MODE=truth-only npm start
```

The hierarchy is intentionally small:

```yaml
version: 1
name: My workspace
projects:
  - id: product
    name: Product
    objective: Ship the first useful release
    features:
      - id: onboarding
        title: Onboarding
        tasks:
          - id: signup
            title: Signup flow
            owner: codex
            status: in_progress
            nextAction: Verify the happy path
            resumeHint: codex resume signup
            subtasks: []
            evidence: []
    tasks: []
```

Every ID must be unique. Supported states are `planned`, `in_progress`, `blocked`, `awaiting_review`, and `verified`.

## Evidence, not vibes

V1 inspects two proof types:

- `commit`: verifies that a 7–40 character lowercase SHA exists inside a repository below the YAML directory.
- `human_review`: `approved` proves completion; `pending` moves the item to review.

`test`, `pr_merged`, `deployed`, and `observed` are represented but return `not_checked_v1`. They cannot prove completion yet. A declared `verified` item without verified evidence is downgraded to `in_progress` with `unproven_claim`.

## Activity modes

| Mode | Behavior |
| --- | --- |
| `demo` | Uses the fictional activity fixture. This is the default. |
| `truth-only` | Shows no workers. Progress still works completely. |
| `native` | Reads local Codex threads and accepts Claude Code/OpenClaw lifecycle hooks. |
| `live` | Reads a local AMC-compatible JSON endpoint with an 800 ms timeout. |

### Native Codex + Claude Code

Codex needs no configuration. Agent Village calls the local, read-only `codex app-server` thread list and retains only the conversation ID, source role, redacted title, project folder name, state, and timestamp. Codex subagent sources render as helpers.

Install the Claude Code lifecycle hooks once, then start the dashboard:

```sh
npm run connect:claude
VILLAGE_MODE=native npm start
```

The installer preserves existing Claude settings and is idempotent. It observes `SubagentStart` and `SubagentStop` so helpers remain attached to their lead. Remove only Agent Village's hooks with `npm run disconnect:claude`.

### OpenClaw

Install the bundled local plugin on a machine with OpenClaw:

```sh
openclaw plugins install ./integrations/openclaw
VILLAGE_MODE=native npm start
```

The plugin sends lifecycle metadata only. OpenClaw is optional and is not a runtime dependency of Agent Village.

For live mode:

```sh
VILLAGE_MODE=live AMC_ENDPOINT=http://127.0.0.1:PORT/api/dashboard npm start
```

The adapter accepts only loopback HTTP endpoints, allowlists fields, normalizes tools/states, redacts likely paths, emails, and secrets, and never mutates progress. Map session titles to tasks with `activity_mapping` in the YAML fixture.

## Quality gates

```sh
npm run typecheck
npm test -- --run
npm run build
npm run e2e
node scripts/check-clean.mjs
npm audit
```

See [connections](docs/connections.md), [architecture](docs/architecture.md), [private deployment](docs/deployment.md), [contributing](CONTRIBUTING.md), and [security](SECURITY.md).

## V1 boundaries

No database, game engine, copied game asset, WebSocket layer, authentication system, or agent control plane. Public hosting serves the fictional demo only; real agent activity stays on the local machine. React, CSS pixel art, and YAML are enough for the first release. See [the backlog](docs/backlog.md) for deliberately deferred work.

Apache-2.0. See `LICENSE` and `NOTICE`.

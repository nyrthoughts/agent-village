# Agent Village

Agent Village turns parallel agent work into a small village you can read in seconds.

![Agent Village desktop preview](docs/preview-desktop.png)

The private native village groups actual Codex and Claude Code conversations into project buildings. It shows recent requests, timestamped reports and source history after the owner's passkey check. The public [GitHub Pages demo](https://nyrthoughts.github.io/agent-village/) uses fictional data. Activity and agent reports never prove delivery.

## Private native quick start

Requirements: Node.js 20.19+, npm and sqlite3. Run from a trusted source checkout:

```sh
npm ci
npm run build
npm run auth:setup
VILLAGE_MODE=native npm start
```

Open `http://localhost:4180`. Setup prints the location of a private `bootstrap.txt` file, never its code. Open it locally, enter the code in the locked page within 15 minutes, then register your passkey. User verification is required. Enrollment consumes the code; setup cannot replace an enrolled owner.

Conversations do not load before authentication. The browser keeps its bearer token only in memory for 30 minutes. Reloading requires another login. **Lock** removes private content immediately; successful logout revokes the server session. Each login rotates the previous session.

The server binds to `127.0.0.1` but uses `localhost` as the canonical browser origin. The IP URL redirects to localhost on the same port. Remote devices, Tailscale proxies and public tunnels are unsupported. See [owner access](docs/owner-access.md) and [deployment](docs/deployment.md) for private storage, restarts and the disposable launcher.

## Read or visit

- Read sourced project updates, a combined timeline and original conversations. Briefs extract explicit sections; they are not model-generated summaries or independently verified results.
- Open any project directly from the list or a building. Optional **Visit the village** mode adds three avatar appearances and click-to-walk paths around houses, forest and water.
- Click a house in visit mode to reach its door and open its brief. A new destination replaces the old one; Escape stops walking. Keyboard activation opens details immediately.
- Use bounded camera panning, mobile controls and reduced motion. Source refreshes do not reset an unchanged route.
- Choose **Français / English** before login or in the village. Interface labels and dates change; source conversations keep their original language. No translation API is used.
- Mark a project as read to identify later exchanges. Reading points and language stay in browser storage; bearer tokens and conversation text do not.

The village uses original pixel art and eight building families, with no copied game assets or added game engine. Agents and helpers are separate observations, not completion indicators.

## Connect existing work

Codex requires no API key. Native mode uses `sqlite3 -readonly` against its existing local index, then reads bounded transcript tails. Claude sessions come from existing journals and process metadata, including tmux when present. Nothing starts or instructs an agent.

The view refreshes every five seconds while visible. It selects up to 60 sessions per source with a seven-day recency window; running Claude sessions may be older. Each transcript read is capped at 4 MiB and displayed history at 24 exchanges per session. Reasoning and tool payloads are excluded. Original journals remain the history source; no new conversation database is created.

Projects are grouped automatically. `VILLAGE_PROJECT_ALIASES` maps directory paths, session IDs or title prefixes to display names. `VILLAGE_FOCUS_PROJECTS` selects initially displayed project names; search still exposes the rest after login. Keep real path mappings outside the repository.

Claude and OpenClaw hooks are optional. After first-time `auth:setup`:

```sh
npm run connect:claude
# Remove only Agent Village hooks:
npm run disconnect:claude
```

The installer preserves unrelated Claude settings. Hook requests load a separate authorization header from the private `ingestion.header` file. It permits observation submissions, never project reads or owner authentication. The bundled OpenClaw plugin uses the same private header and reports lifecycle metadata only. See [connections](docs/connections.md) for installation and custom ports.

## Demo and YAML modes

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` for the fictional development fixture. To serve its production build:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:4180`. These demo commands do not enable native observation.

| Mode | Data and access |
| --- | --- |
| `demo` | Fictional YAML and activity fixture; default, no owner gate. |
| `truth-only` | YAML evidence without workers; no owner gate. |
| `native` | Owner passkey required; local observed projects and conversations. |
| `live` | YAML plus an AMC-compatible loopback activity endpoint; no owner gate. |

Use fictional or non-sensitive inputs outside native mode. Copy `fixtures/village.demo.yaml` to define a YAML workspace and set `VILLAGE_FILE` to its location. All IDs must be unique. Supported states are `planned`, `in_progress`, `blocked`, `awaiting_review` and `verified`.

YAML modes map `workspace → project → feature → task → subtask` into evidence-based construction stages. V1 verifies repository commit existence and approved human review. Other represented proof types (`test`, `pr_merged`, `deployed`, `observed`) remain `not_checked_v1`; they cannot prove completion. Native buildings instead organize observations and omit unsupported progress percentages, token counts and time estimates.

## Privacy boundary

The public repository and demo contain fictional data and cannot read this computer's sessions. Native source conversations stay local; authentication files must remain outside the repository and build output.

Passkeys do not protect journals against software running as the owner's OS account, root/administrator access or malware. Anyone using an unlocked browser session can read it. Do not share the OS account, passkey or active session. See [security](SECURITY.md) for the full boundary.

## Quality gates

```sh
npm run typecheck
npm test -- --run
npm run build
npm run e2e
node scripts/check-clean.mjs
npm audit
```

See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md) and [the backlog](docs/backlog.md). Agent Village has no agent control plane, remote transcript bridge or model inference service.

Apache-2.0. See `LICENSE` and `NOTICE`.

# Agent Village

Agent Village is a local, read-only operations board for parallel agent work. One scan answers: what moves, what changed since your last visit, what is blocked, and where you need to step in.

The private native board reads existing Codex and Claude Code sessions after the owner's passkey check. The public [GitHub Pages demo](https://nyrthoughts.github.io/agent-village/) shows a fictional six-project board. Activity and agent reports never prove delivery.

## Private native quick start

Requirements: Node.js 20.19+, npm and sqlite3. Run from a trusted source checkout:

```sh
npm ci
npm run build
npm run auth:setup
VILLAGE_MODE=native npm start
```

Open `http://localhost:4180`. Setup prints the location of a private `bootstrap.txt` file, never its code. Open it locally, enter the code in the locked page within 15 minutes, then register your passkey. User verification is required. Enrollment consumes the code; setup cannot replace an enrolled owner.

Conversations do not load before authentication. The browser keeps its bearer token only in memory for 30 minutes. Reloading requires another login. **Lock** removes private content immediately; successful logout revokes the server session and closes the live stream. Each login rotates the previous session.

The server binds to `127.0.0.1` but uses `localhost` as the canonical browser origin. Remote devices, Tailscale proxies and public tunnels are unsupported. See [owner access](docs/owner-access.md) and [deployment](docs/deployment.md).

## Reading the board

- **For you** — contradictions, decisions, reports to read and validations, by type then oldest wait first. Each item quotes its dated source and stays until a newer source fact or your action (seen, snooze, validation) resolves it; nothing expires on a hidden timer.
- **Since your last visit** — changes after your last visit, grouped by project; minor changes are folded.
- **Projects** — one line per project: goal, state, declared next action, declared dependencies, milestones validated in your ledger and the proof ladder `Declared / Activity / Commit / CI / Merge / Deployment`. GitHub proofs count only for the project's observed repository and branch, then the exact SHA. An unlit dot means *not observed*, never *failed*; partial or unrecognized CI is shown as inconclusive, never green. No percentages or ETAs.
- **Detail** — opens beside the list: sourced proofs, the goal and milestone ledger, sessions with copy-only resume commands, the sourced timeline and the source conversation.
- **Unmatched** — sessions received without a trusted project identity. Attach them explicitly; nothing is guessed from names.
- **Source bar** — stream status, every source with its age (stale beyond three cadences, unreachable after a failure) and the measured render latency.

While your pointer or focus is in the board, or a detail is open, the view stays frozen and shows "N changes — apply". Applying keeps your selection and scroll position. Keyboard: `j`/`k` to move, Enter to open, Escape to close. Choose **Français / English** before login or on the board; source conversations keep their language.

## Real time

The server keeps an append-only event journal with exact, durable deduplication and a monotone sequence, projects it with a pure reducer and pushes events over an authenticated stream. Claude/OpenClaw hooks arrive immediately; Codex and Claude journals are detected with file watching and a 5-second safety poll; optional GitHub facts are read every 30–60 seconds. A disconnected browser catches up exactly from its last sequence or receives a fresh snapshot, and polls every 5 seconds until the stream returns. See [architecture](docs/architecture.md).

## Connect existing work

Codex requires no API key. Native mode uses `sqlite3 -readonly` against its existing local index, then reads bounded transcript tails. Claude sessions come from existing journals and process metadata. Nothing starts or instructs an agent.

Claude and OpenClaw hooks are optional. After first-time `auth:setup`:

```sh
npm run connect:claude
# Remove only Agent Village hooks:
npm run disconnect:claude
```

Hook requests use a separate `ingestion.header` that permits observation submissions only, never reads or owner authentication.

GitHub facts (head commits of the observed branches and the default branch, check runs for each exact SHA, pull requests, deployments) are opt-in per repository and read-only:

```sh
VILLAGE_GITHUB_REPOS='["owner/name"]' VILLAGE_MODE=native npm start
```

They use your local `gh` authentication with conditional requests. Text is redacted and credential-bearing links are dropped before anything is stored. No webhook or tunnel. See [connections](docs/connections.md) for aliases, mappings and custom ports.

## Demo and YAML modes

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` for the fictional board. To serve the production build: `npm run build && npm start`, then open `http://127.0.0.1:4180`.

| Mode | Data and access |
| --- | --- |
| `demo` | Fictional six-project board; default, no owner gate. |
| `truth-only` | YAML tasks with evidence verdicts; no owner gate. |
| `native` | Owner passkey required; local sessions, hooks and optional GitHub. |
| `live` | YAML plus an AMC-compatible loopback activity endpoint; no owner gate. |

Use fictional or non-sensitive inputs outside native mode. YAML modes verify commit existence and approved human review; `test`, `pr_merged`, `deployed` and `observed` evidence remain `not_checked_v1` and cannot prove completion.

## Privacy boundary

The public repository and demo contain fictional data and cannot read this computer's sessions. The journal, plans, mappings and authentication files stay in a private owner-only directory outside the repository and build output.

Passkeys do not protect journals against software running as the owner's OS account, root/administrator access or malware. Anyone using an unlocked browser session can read it. See [security](SECURITY.md).

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

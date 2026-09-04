# Deployment

V1 has two deliberately separate surfaces:

- A public static preview can show the fictional fixture only.
- A private local server can observe real Codex, Claude Code, and OpenClaw activity.

Browsers cannot read local agent sessions from a hosted page. V1 does not add a database or upload bridge to work around that boundary.

## Public demo

`npm run build` exports redacted demo snapshots to `dist/demo` and builds the static client. When `/api/village` and `/api/activity` are absent, the client falls back on an HTTP 404 or a static host's HTML shell. Validation failures and server errors remain visible.

The export runs through the same activity allowlist as the local server. It contains no prompts, transcripts, secrets, costs, token counts, or local paths.

The `deploy public demo` workflow publishes `design/emerald-village-v4` to GitHub Pages. It sets `VILLAGE_PUBLIC_BASE=/agent-village/` so assets and demo snapshots work from the repository subpath.

## Local production run

### Temporary Codex observer

```sh
curl -fsSL https://raw.githubusercontent.com/nyrthoughts/agent-village/design/emerald-village-v4/scripts/run-temporary.sh | sh
```

The launcher contains download, dependencies, npm cache, build, and runtime below one validated `mktemp` directory. It stops its child server and deletes that directory on normal exit and handled termination signals. It binds to loopback and never uploads local activity.

This is not zero-resource execution: temporary disk and RAM are required while the observer runs. It is zero-installation after the process stops. Claude Code hooks and the OpenClaw plugin are excluded because they intentionally change local tool configuration.

### Source checkout

```sh
npm ci
npm run build
VILLAGE_FILE=/absolute/path/to/village.yaml VILLAGE_MODE=truth-only npm start
```

The server binds to `127.0.0.1:4180`. Verify `http://127.0.0.1:4180/api/health` before connecting anything else.

Use `VILLAGE_MODE=live` and set `AMC_ENDPOINT` only after a compatible activity endpoint is running on loopback. Keep secrets, transcripts, prompts, file paths, and customer data out of the village YAML and source payload.

Use `VILLAGE_MODE=native` for the bundled Codex, Claude Code, and OpenClaw connectors. Configure the tool hooks before starting the dashboard; see [connections](connections.md).

## Optional tailnet access

If you already use Tailscale, its `serve` command can proxy a loopback service to your private tailnet:

```sh
tailscale serve --bg http://127.0.0.1:4180
tailscale serve status
```

Stop sharing with:

```sh
tailscale serve off
```

Tailscale Serve is tailnet-only; Funnel is public internet exposure and is intentionally out of scope. Review your tailnet ACLs before enabling Serve. Current syntax is documented in the [official Tailscale Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

## Recommended order

1. Start in `truth-only` mode with one real project.
2. Confirm that the statuses and one-click recovery context are useful for a week.
3. Add explicit activity mappings for only the sessions you want to surface.
4. Enable private tailnet access only if viewing from another device is valuable.

Do not add a database, public host, or write/control endpoints until real usage proves they are needed.

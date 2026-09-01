# Private deployment

V1 is designed to run locally. It has not been deployed or exposed by this repository.

## Local production run

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

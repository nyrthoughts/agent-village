# OpenClaw connector

This observation-only plugin reports lifecycle state to a local Agent Village server. It never sends prompts, messages, tool inputs, tool outputs, or transcript content.

```bash
npm run auth:setup
openclaw plugins install ./integrations/openclaw
VILLAGE_MODE=native npm start
```

The server defaults to `http://127.0.0.1:4180`; the browser uses `http://localhost:4180` for passkeys. Set `AGENT_VILLAGE_URL` in the OpenClaw Gateway environment to change the loopback ingestion URL.

Run setup only before the first owner enrollment. It writes a private `ingestion.header` file in `~/.local/share/agent-village`, or `VILLAGE_AUTH_DIR` when set. Use the same directory for the server and gateway. The plugin reads its observation credential from this file; it never puts the secret in its configuration or logs. Missing/invalid credentials stop observation delivery. They never unlock the village. External URLs and redirects are rejected.

Remove it with:

```bash
openclaw plugins uninstall agent-village
```

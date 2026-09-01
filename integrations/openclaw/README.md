# OpenClaw connector

This observation-only plugin reports lifecycle state to a local Agent Village server. It never sends prompts, messages, tool inputs, tool outputs, or transcript content.

```bash
openclaw plugins install ./integrations/openclaw
VILLAGE_MODE=native npm start
```

The server defaults to `http://127.0.0.1:4180`. Set `AGENT_VILLAGE_URL` in the OpenClaw Gateway environment to change the loopback URL.

Remove it with:

```bash
openclaw plugins uninstall agent-village
```

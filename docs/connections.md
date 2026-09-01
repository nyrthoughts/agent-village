# Connections

Agent Village observes lifecycle state. It does not start, stop, approve, or send instructions to agents, and activity never changes a building's progress.

## Codex

Run `VILLAGE_MODE=native npm start`. No installation step is required when the `codex` CLI is available. The server starts `codex app-server --stdio`, calls the read-only `thread/list` method, then closes the process. Results are cached for ten seconds and inactive conversations expire from the view after 30 minutes by default.

Set `VILLAGE_IDLE_MINUTES` to change that window.

## Claude Code

```sh
npm run connect:claude
VILLAGE_MODE=native npm start
```

The installer updates `~/.claude/settings.json` atomically, preserves existing hooks, and adds short loopback POST hooks. It is safe to run again. To reverse it:

```sh
npm run disconnect:claude
```

The server stores only session ID, project folder name, normalized state, and timestamp in memory. It does not persist hook payloads.

## OpenClaw

```sh
openclaw plugins install ./integrations/openclaw
VILLAGE_MODE=native npm start
```

The bundled plugin uses the typed `session_start`, `before_agent_run`, `agent_end`, and `session_end` hooks. It reports the session key, agent ID, workspace folder, and lifecycle state to loopback. It never reads messages, prompts, tool calls, or outputs.

OpenClaw is not bundled. Installation must happen on the machine where its Gateway runs.

## Map a conversation to a building

Workers appear in the live-conversations panel even without a mapping. To place one beside a building, add a case-insensitive title substring to the YAML:

```yaml
activity_mapping:
  - match: agent village
    taskId: publish-v1
```

Mapping changes position only. Building status still comes exclusively from the truth plane and its evidence.
